# ============================================================
# IMPORTS
# ============================================================

import sys
import traceback
import os
import logging
import json
import sqlite3
from datetime import datetime
from contextlib import contextmanager

from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import joblib
import pandas as pd
import numpy as np

# Load environment variables for API keys
from dotenv import load_dotenv
load_dotenv()

# Import AI Assistant
from ai_assistant import AILeadAssistant, init_ai_database

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============================================================
# FLASK APP INITIALIZATION
# ============================================================

app = Flask(__name__)
CORS(app)

# ============================================================
# DATABASE SETUP
# ============================================================

DATABASE = 'leads.db'

def get_db():
    """Get database connection"""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

@contextmanager
def db_connection():
    """Context manager for database connections"""
    conn = get_db()
    try:
        yield conn
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def init_db():
    """Initialize database tables"""
    with db_connection() as conn:
        # Leads table
        conn.execute('''
            CREATE TABLE IF NOT EXISTS leads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_data TEXT NOT NULL,
                prediction TEXT NOT NULL,
                probability_yes REAL NOT NULL,
                probability_no REAL NOT NULL,
                confidence REAL NOT NULL,
                priority TEXT NOT NULL,
                message TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                source TEXT DEFAULT 'single'
            )
        ''')
        
        conn.execute('''
            CREATE INDEX IF NOT EXISTS idx_timestamp ON leads(timestamp)
        ''')
        
        conn.execute('''
            CREATE INDEX IF NOT EXISTS idx_prediction ON leads(prediction)
        ''')
        
        # Chat History Table
        conn.execute('''
            CREATE TABLE IF NOT EXISTS chat_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lead_id INTEGER,
                question TEXT NOT NULL,
                answer TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (lead_id) REFERENCES leads(id)
            )
        ''')
        
        conn.execute('CREATE INDEX IF NOT EXISTS idx_chat_lead ON chat_history(lead_id)')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_chat_timestamp ON chat_history(timestamp)')
        
        logger.info("✅ Database initialized successfully")

# Initialize database on startup
init_db()

# ============================================================
# LOAD MODEL AND PREPROCESSOR
# ============================================================

try:
    model = joblib.load('models/best_model.pkl')
    preprocessor = joblib.load('models/preprocessor.pkl')
    logger.info("✅ Model and preprocessor loaded successfully!")
except Exception as e:
    logger.error(f"❌ Failed to load model: {e}")
    model = None
    preprocessor = None

# ============================================================
# AI ASSISTANT INITIALIZATION (Groq)
# ============================================================

try:
    init_ai_database()
    ai_assistant = AILeadAssistant()
    if ai_assistant and ai_assistant.available:
        print("✅ AI Assistant (Groq) initialized successfully!")
    else:
        print("⚠️ AI Assistant initialized but Groq not available. Check API key.")
except Exception as e:
    print(f"❌ AI Assistant initialization error: {e}")
    ai_assistant = None

# ============================================================
# FEATURE VALIDATION
# ============================================================

REQUIRED_FEATURES = [
    'age', 'job', 'marital', 'education', 'default', 'balance',
    'housing', 'loan', 'contact', 'day', 'month', 'duration',
    'campaign', 'pdays', 'previous', 'poutcome'
]

# ============================================================
# ROUTES - HOME
# ============================================================

@app.route('/')
def home():
    """Render the landing page by default"""
    return render_template('landing.html')

@app.route('/app')
def app_main():
    """Render the main application page"""
    return render_template('index.html')
    
# ============================================================
# ROUTES - PREDICTION
# ============================================================

@app.route('/predict', methods=['POST'])
def predict():
    """Make a prediction for a single client"""
    if model is None or preprocessor is None:
        return jsonify({
            'error': 'Model not loaded. Please check server logs.',
            'status': 'error'
        }), 503

    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'error': 'No data provided',
                'status': 'error'
            }), 400
        
        # Validate required features
        missing = [f for f in REQUIRED_FEATURES if f not in data]
        if missing:
            return jsonify({
                'error': f'Missing required fields: {", ".join(missing)}',
                'status': 'error'
            }), 400
        
        # Convert to DataFrame
        df = pd.DataFrame([data])
        
        # Ensure numeric fields are properly typed
        numeric_fields = ['age', 'balance', 'day', 'duration', 
                        'campaign', 'pdays', 'previous']
        for field in numeric_fields:
            if field in df.columns:
                df[field] = pd.to_numeric(df[field])
        
        # Transform and predict
        transformed = preprocessor.transform(df)
        prediction = model.predict(transformed)[0]
        probability = model.predict_proba(transformed)[0]
        
        # Create response
        is_yes = prediction == 1
        prob_yes = round(probability[1] * 100, 1)
        prob_no = round(probability[0] * 100, 1)
        
        # Determine priority level
        if prob_yes >= 70:
            priority = 'High Priority'
            message = '🎯 Call this client immediately!'
        elif prob_yes >= 45:
            priority = 'Medium Priority'
            message = '📞 Consider calling this client'
        else:
            priority = 'Low Priority'
            message = '⏳ Skip this client for now'
        
        confidence = min(round(abs(prob_yes - 50) * 2, 1), 95)
        
        # Save to database
        with db_connection() as conn:
            conn.execute('''
                INSERT INTO leads 
                (client_data, prediction, probability_yes, probability_no, 
                 confidence, priority, message, source)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                json.dumps(data),
                'Yes' if is_yes else 'No',
                prob_yes,
                prob_no,
                confidence,
                priority,
                message,
                'single'
            ))
        
        logger.info(f"Prediction saved: {data.get('job', 'unknown')} | Result: {'Yes' if is_yes else 'No'}")
        
        return jsonify({
            'prediction': 'Yes' if is_yes else 'No',
            'probability_yes': prob_yes,
            'probability_no': prob_no,
            'recommendation': priority,
            'priority': priority,
            'message': message,
            'confidence': confidence,
            'timestamp': datetime.now().isoformat(),
            'status': 'success'
        })
        
    except Exception as e:
        logger.error(f"Prediction error: {e}\n{traceback.format_exc()}")
        return jsonify({
            'error': f'Prediction failed: {str(e)}',
            'status': 'error'
        }), 500

@app.route('/predict_bulk', methods=['POST'])
def predict_bulk():
    """Make predictions for multiple clients"""
    if model is None or preprocessor is None:
        return jsonify({
            'error': 'Model not loaded. Please check server logs.',
            'status': 'error'
        }), 503

    try:
        data = request.get_json()
        
        if not data or 'clients' not in data:
            return jsonify({
                'error': 'Missing "clients" array in request',
                'status': 'error'
            }), 400
        
        clients = data['clients']
        if not isinstance(clients, list):
            return jsonify({
                'error': '"clients" must be an array',
                'status': 'error'
            }), 400
        
        if len(clients) > 1000:
            return jsonify({
                'error': 'Maximum 1000 clients allowed per request',
                'status': 'error'
            }), 400
        
        results = []
        saved_count = 0
        
        for client in clients:
            try:
                df = pd.DataFrame([client])
                transformed = preprocessor.transform(df)
                prediction = model.predict(transformed)[0]
                probability = model.predict_proba(transformed)[0]
                
                is_yes = prediction == 1
                prob_yes = round(probability[1] * 100, 1)
                prob_no = round(probability[0] * 100, 1)
                
                if prob_yes >= 70:
                    priority = 'High Priority'
                    message = '🎯 Call this client immediately!'
                elif prob_yes >= 45:
                    priority = 'Medium Priority'
                    message = '📞 Consider calling this client'
                else:
                    priority = 'Low Priority'
                    message = '⏳ Skip this client for now'
                
                confidence = min(round(abs(prob_yes - 50) * 2, 1), 95)
                
                # Save to database
                with db_connection() as conn:
                    conn.execute('''
                        INSERT INTO leads 
                        (client_data, prediction, probability_yes, probability_no, 
                         confidence, priority, message, source)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        json.dumps(client),
                        'Yes' if is_yes else 'No',
                        prob_yes,
                        prob_no,
                        confidence,
                        priority,
                        message,
                        'bulk'
                    ))
                    saved_count += 1
                
                results.append({
                    'client': client,
                    'prediction': 'Yes' if is_yes else 'No',
                    'probability_yes': prob_yes,
                    'probability_no': prob_no,
                    'priority': priority,
                    'confidence': confidence,
                    'status': 'success'
                })
            except Exception as e:
                results.append({
                    'client': client,
                    'error': str(e),
                    'status': 'error'
                })
        
        # Summary statistics
        total = len(results)
        success_count = sum(1 for r in results if r['status'] == 'success')
        yes_count = sum(1 for r in results if r.get('prediction') == 'Yes')
        
        logger.info(f"Bulk prediction completed: {saved_count} saved, {yes_count} high potential")
        
        return jsonify({
            'results': results,
            'summary': {
                'total': total,
                'successful': success_count,
                'high_potential': yes_count,
                'low_priority': total - yes_count,
                'saved': saved_count
            },
            'status': 'success'
        })
        
    except Exception as e:
        logger.error(f"Bulk prediction error: {e}\n{traceback.format_exc()}")
        return jsonify({
            'error': f'Bulk prediction failed: {str(e)}',
            'status': 'error'
        }), 500

# ============================================================
# ROUTES - LEADS MANAGEMENT
# ============================================================

@app.route('/leads', methods=['GET'])
def get_leads():
    """Get all leads with optional filtering"""
    try:
        limit = request.args.get('limit', 100, type=int)
        offset = request.args.get('offset', 0, type=int)
        prediction = request.args.get('prediction', None)
        priority = request.args.get('priority', None)
        from_date = request.args.get('from_date', None)
        to_date = request.args.get('to_date', None)
        
        query = "SELECT * FROM leads WHERE 1=1"
        params = []
        
        if prediction:
            query += " AND prediction = ?"
            params.append(prediction)
        
        if priority:
            query += " AND priority = ?"
            params.append(priority)
        
        if from_date:
            query += " AND timestamp >= ?"
            params.append(from_date)
        
        if to_date:
            query += " AND timestamp <= ?"
            params.append(to_date)
        
        query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        
        with db_connection() as conn:
            leads = conn.execute(query, params).fetchall()
            
            # Get total count
            count_query = "SELECT COUNT(*) as total FROM leads WHERE 1=1"
            count_params = []
            if prediction:
                count_query += " AND prediction = ?"
                count_params.append(prediction)
            if priority:
                count_query += " AND priority = ?"
                count_params.append(priority)
            
            total = conn.execute(count_query, count_params).fetchone()['total']
        
        # Convert to list of dicts
        leads_list = []
        for lead in leads:
            lead_dict = dict(lead)
            lead_dict['client_data'] = json.loads(lead_dict['client_data'])
            leads_list.append(lead_dict)
        
        return jsonify({
            'leads': leads_list,
            'total': total,
            'limit': limit,
            'offset': offset,
            'status': 'success'
        })
        
    except Exception as e:
        logger.error(f"Error fetching leads: {e}")
        return jsonify({
            'error': str(e),
            'status': 'error'
        }), 500

@app.route('/leads/<int:lead_id>', methods=['DELETE'])
def delete_lead(lead_id):
    """Delete a single lead"""
    try:
        with db_connection() as conn:
            # Check if lead exists
            lead = conn.execute(
                "SELECT id FROM leads WHERE id = ?",
                (lead_id,)
            ).fetchone()
            
            if not lead:
                return jsonify({
                    'error': 'Lead not found',
                    'status': 'error'
                }), 404
            
            conn.execute(
                "DELETE FROM leads WHERE id = ?",
                (lead_id,)
            )
            
            logger.info(f"Lead {lead_id} deleted")
            
            return jsonify({
                'message': 'Lead deleted successfully',
                'status': 'success'
            })
            
    except Exception as e:
        logger.error(f"Error deleting lead: {e}")
        return jsonify({
            'error': str(e),
            'status': 'error'
        }), 500

@app.route('/leads/clear', methods=['DELETE'])
def clear_all_leads():
    """Delete all leads"""
    try:
        confirm = request.args.get('confirm', 'false')
        
        if confirm != 'true':
            return jsonify({
                'error': 'Confirmation required. Use ?confirm=true',
                'status': 'error'
            }), 400
        
        with db_connection() as conn:
            count = conn.execute("SELECT COUNT(*) as total FROM leads").fetchone()['total']
            conn.execute("DELETE FROM leads")
            conn.execute("DELETE FROM sqlite_sequence WHERE name='leads'")
            
            logger.info(f"All {count} leads deleted")
            
            return jsonify({
                'message': f'All {count} leads deleted successfully',
                'deleted_count': count,
                'status': 'success'
            })
            
    except Exception as e:
        logger.error(f"Error clearing leads: {e}")
        return jsonify({
            'error': str(e),
            'status': 'error'
        }), 500

@app.route('/leads/stats', methods=['GET'])
def get_lead_stats():
    """Get statistics about leads"""
    try:
        with db_connection() as conn:
            total = conn.execute("SELECT COUNT(*) as total FROM leads").fetchone()['total']
            high = conn.execute(
                "SELECT COUNT(*) as total FROM leads WHERE prediction = 'Yes'"
            ).fetchone()['total']
            low = total - high
            
            monthly = conn.execute('''
                SELECT 
                    strftime('%Y-%m', timestamp) as month,
                    COUNT(*) as total,
                    SUM(CASE WHEN prediction = 'Yes' THEN 1 ELSE 0 END) as yes_count
                FROM leads
                GROUP BY month
                ORDER BY month DESC
                LIMIT 12
            ''').fetchall()
            
            jobs = conn.execute('''
                SELECT 
                    json_extract(client_data, '$.job') as job,
                    COUNT(*) as total,
                    SUM(CASE WHEN prediction = 'Yes' THEN 1 ELSE 0 END) as yes_count
                FROM leads
                WHERE json_extract(client_data, '$.job') IS NOT NULL
                GROUP BY job
                ORDER BY total DESC
                LIMIT 10
            ''').fetchall()
            
            avg_confidence = conn.execute(
                "SELECT AVG(confidence) as avg FROM leads"
            ).fetchone()['avg'] or 0
            
            return jsonify({
                'total': total,
                'high_potential': high,
                'low_priority': low,
                'conversion_rate': round((high / total * 100) if total > 0 else 0, 1),
                'avg_confidence': round(avg_confidence, 1),
                'monthly': [dict(m) for m in monthly],
                'jobs': [dict(j) for j in jobs],
                'status': 'success'
            })
            
    except Exception as e:
        logger.error(f"Error getting stats: {e}")
        return jsonify({
            'error': str(e),
            'status': 'error'
        }), 500

# ============================================================
# ROUTES - LEAD SCORING
# ============================================================

def calculate_lead_score(client_data):
    """
    Calculate detailed lead score with breakdown
    Returns: total_score, breakdown, insights
    """
    score = 0
    breakdown = []
    insights = []
    max_score = 100
    
    # 1. Previous Outcome (25 points max)
    poutcome = client_data.get('poutcome', 'unknown')
    if poutcome == 'success':
        score += 25
        breakdown.append({
            'factor': 'Previous Success',
            'score': 25,
            'max_score': 25,
            'level': 'high',
            'icon': '✅',
            'description': 'Client subscribed before'
        })
        insights.append('✅ Client had previous success - mention this in conversation')
    elif poutcome == 'failure':
        score += 5
        breakdown.append({
            'factor': 'Previous Outcome',
            'score': 5,
            'max_score': 25,
            'level': 'low',
            'icon': '⚠️',
            'description': 'Previous attempt failed'
        })
        insights.append('⚠️ Previous attempt failed - try a different approach')
    else:
        score += 10
        breakdown.append({
            'factor': 'Previous Outcome',
            'score': 10,
            'max_score': 25,
            'level': 'medium',
            'icon': '❓',
            'description': 'No previous contact'
        })
        insights.append('❓ No previous contact - this is a fresh opportunity')
    
    # 2. Call Duration (20 points max)
    duration = client_data.get('duration', 0)
    if duration > 300:
        score += 20
        breakdown.append({
            'factor': 'Call Duration',
            'score': 20,
            'max_score': 20,
            'level': 'high',
            'icon': '📞',
            'description': 'Long engagement (300s+)'
        })
        insights.append('📞 Long call duration - client is engaged and interested')
    elif duration > 150:
        score += 12
        breakdown.append({
            'factor': 'Call Duration',
            'score': 12,
            'max_score': 20,
            'level': 'medium',
            'icon': '📞',
            'description': 'Moderate engagement (150-300s)'
        })
        insights.append('📞 Moderate engagement - keep the conversation flowing')
    else:
        score += 5
        breakdown.append({
            'factor': 'Call Duration',
            'score': 5,
            'max_score': 20,
            'level': 'low',
            'icon': '📞',
            'description': 'Short engagement (<150s)'
        })
        insights.append('📞 Short call - need to build rapport quickly')
    
    # 3. Account Balance (15 points max)
    balance = client_data.get('balance', 0)
    if balance > 5000:
        score += 15
        breakdown.append({
            'factor': 'Account Balance',
            'score': 15,
            'max_score': 15,
            'level': 'high',
            'icon': '💰',
            'description': 'High balance (₦5,000+)'
        })
        insights.append('💰 High balance client - suggest investment products')
    elif balance > 1000:
        score += 10
        breakdown.append({
            'factor': 'Account Balance',
            'score': 10,
            'max_score': 15,
            'level': 'medium',
            'icon': '💰',
            'description': 'Medium balance (₦1,000-5,000)'
        })
        insights.append('💰 Good balance - discuss savings options')
    else:
        score += 3
        breakdown.append({
            'factor': 'Account Balance',
            'score': 3,
            'max_score': 15,
            'level': 'low',
            'icon': '💰',
            'description': 'Low balance (<₦1,000)'
        })
        insights.append('💰 Low balance - consider lower entry products')
    
    # 4. Job Type (12 points max)
    high_value_jobs = ['management', 'admin.', 'technician', 'entrepreneur']
    medium_value_jobs = ['services', 'self-employed', 'retired']
    job = client_data.get('job', 'unknown')
    
    if job in high_value_jobs:
        score += 12
        breakdown.append({
            'factor': 'Job Type',
            'score': 12,
            'max_score': 12,
            'level': 'high',
            'icon': '👔',
            'description': f'High-value job: {job}'
        })
        insights.append(f'👔 {job} professional - likely has disposable income')
    elif job in medium_value_jobs:
        score += 8
        breakdown.append({
            'factor': 'Job Type',
            'score': 8,
            'max_score': 12,
            'level': 'medium',
            'icon': '👔',
            'description': f'Medium-value job: {job}'
        })
        insights.append(f'👔 {job} - stable income source')
    else:
        score += 4
        breakdown.append({
            'factor': 'Job Type',
            'score': 4,
            'max_score': 12,
            'level': 'low',
            'icon': '👔',
            'description': f'Entry-level job: {job}'
        })
        insights.append(f'👔 {job} - may need more convincing')
    
    # 5. Education (10 points max)
    education = client_data.get('education', 'unknown')
    if education == 'tertiary':
        score += 10
        breakdown.append({
            'factor': 'Education',
            'score': 10,
            'max_score': 10,
            'level': 'high',
            'icon': '🎓',
            'description': 'Tertiary education'
        })
        insights.append('🎓 Highly educated - use technical terms and data')
    elif education == 'secondary':
        score += 6
        breakdown.append({
            'factor': 'Education',
            'score': 6,
            'max_score': 10,
            'level': 'medium',
            'icon': '🎓',
            'description': 'Secondary education'
        })
        insights.append('🎓 Good education level - explain benefits clearly')
    else:
        score += 3
        breakdown.append({
            'factor': 'Education',
            'score': 3,
            'max_score': 10,
            'level': 'low',
            'icon': '🎓',
            'description': 'Primary or unknown education'
        })
        insights.append('🎓 Keep explanations simple and clear')
    
    # 6. Age Group (10 points max)
    age = client_data.get('age', 0)
    if 35 <= age <= 55:
        score += 10
        breakdown.append({
            'factor': 'Age Group',
            'score': 10,
            'max_score': 10,
            'level': 'high',
            'icon': '📅',
            'description': 'Prime age (35-55)'
        })
        insights.append('📅 Prime age - likely to have savings and investments')
    elif age > 55:
        score += 8
        breakdown.append({
            'factor': 'Age Group',
            'score': 8,
            'max_score': 10,
            'level': 'medium',
            'icon': '📅',
            'description': 'Senior (55+)'
        })
        insights.append('📅 Senior client - emphasize security and stability')
    else:
        score += 3
        breakdown.append({
            'factor': 'Age Group',
            'score': 3,
            'max_score': 10,
            'level': 'low',
            'icon': '📅',
            'description': 'Young adult (<35)'
        })
        insights.append('📅 Young client - focus on long-term benefits')
    
    # 7. Previous Contacts (8 points max)
    previous = client_data.get('previous', 0)
    if previous > 2:
        score += 8
        breakdown.append({
            'factor': 'Previous Contacts',
            'score': 8,
            'max_score': 8,
            'level': 'high',
            'icon': '🔄',
            'description': f'Multiple contacts ({previous})'
        })
        insights.append('🔄 Multiple previous contacts - they know us, use this')
    elif previous > 0:
        score += 5
        breakdown.append({
            'factor': 'Previous Contacts',
            'score': 5,
            'max_score': 8,
            'level': 'medium',
            'icon': '🔄',
            'description': f'Some contacts ({previous})'
        })
        insights.append('🔄 Some previous contact - reference past interactions')
    else:
        score += 2
        breakdown.append({
            'factor': 'Previous Contacts',
            'score': 2,
            'max_score': 8,
            'level': 'low',
            'icon': '🔄',
            'description': 'First contact'
        })
        insights.append('🔄 First contact - make a good first impression')
    
    return {
        'total_score': score,
        'max_score': max_score,
        'percentage': round((score / max_score) * 100, 1),
        'breakdown': breakdown,
        'insights': insights[:5]  # Top 5 insights
    }

@app.route('/lead-score/<int:lead_id>', methods=['GET'])
def get_lead_score(lead_id):
    """Get detailed lead score with breakdown"""
    try:
        with db_connection() as conn:
            lead = conn.execute(
                "SELECT client_data, prediction, probability_yes, confidence FROM leads WHERE id = ?",
                (lead_id,)
            ).fetchone()
            
            if not lead:
                return jsonify({
                    'error': 'Lead not found',
                    'status': 'error'
                }), 404
            
            client_data = json.loads(lead['client_data'])
            score_data = calculate_lead_score(client_data)
            
            # Add prediction info
            score_data['prediction'] = lead['prediction']
            score_data['probability'] = lead['probability_yes']
            score_data['confidence'] = lead['confidence']
            
            return jsonify({
                'score': score_data,
                'status': 'success'
            })
            
    except Exception as e:
        logger.error(f"Error getting lead score: {e}")
        return jsonify({
            'error': str(e),
            'status': 'error'
        }), 500

@app.route('/lead-score/batch', methods=['POST'])
def batch_lead_scores():
    """Get scores for multiple leads"""
    try:
        data = request.get_json()
        if not data or 'lead_ids' not in data:
            return jsonify({
                'error': 'Missing lead_ids array',
                'status': 'error'
            }), 400
        
        lead_ids = data['lead_ids']
        results = []
        
        with db_connection() as conn:
            for lead_id in lead_ids:
                lead = conn.execute(
                    "SELECT id, client_data, prediction, probability_yes, confidence FROM leads WHERE id = ?",
                    (lead_id,)
                ).fetchone()
                
                if lead:
                    client_data = json.loads(lead['client_data'])
                    score_data = calculate_lead_score(client_data)
                    score_data['id'] = lead['id']
                    score_data['prediction'] = lead['prediction']
                    score_data['probability'] = lead['probability_yes']
                    results.append(score_data)
        
        return jsonify({
            'scores': results,
            'count': len(results),
            'status': 'success'
        })
        
    except Exception as e:
        logger.error(f"Error in batch scoring: {e}")
        return jsonify({
            'error': str(e),
            'status': 'error'
        }), 500

# ============================================================
# ROUTES - CHAT HISTORY
# ============================================================

@app.route('/chat/save', methods=['POST'])
def save_chat():
    """Save a chat message to history"""
    try:
        data = request.get_json()
        lead_id = data.get('lead_id')
        question = data.get('question')
        answer = data.get('answer')
        
        if not lead_id or not question or not answer:
            return jsonify({'error': 'Missing required fields'}), 400
        
        with db_connection() as conn:
            conn.execute('''
                INSERT INTO chat_history (lead_id, question, answer)
                VALUES (?, ?, ?)
            ''', (lead_id, question, answer))
        
        return jsonify({'status': 'success'})
    except Exception as e:
        logger.error(f"Error saving chat: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/chat/history/<int:lead_id>', methods=['GET'])
def get_chat_history(lead_id):
    """Get chat history for a lead"""
    try:
        with db_connection() as conn:
            history = conn.execute('''
                SELECT id, question, answer, timestamp
                FROM chat_history
                WHERE lead_id = ?
                ORDER BY timestamp ASC
            ''', (lead_id,)).fetchall()
        
        return jsonify({
            'history': [dict(h) for h in history],
            'count': len(history),
            'status': 'success'
        })
    except Exception as e:
        logger.error(f"Error getting chat history: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/chat/clear/<int:lead_id>', methods=['DELETE'])
def clear_chat_history(lead_id):
    """Clear chat history for a lead"""
    try:
        with db_connection() as conn:
            conn.execute('DELETE FROM chat_history WHERE lead_id = ?', (lead_id,))
        return jsonify({'status': 'success', 'message': 'Chat history cleared'})
    except Exception as e:
        logger.error(f"Error clearing chat history: {e}")
        return jsonify({'error': str(e)}), 500

# ============================================================
# ROUTES - AI ASSISTANT
# ============================================================

@app.route('/ai/ask', methods=['POST'])
def ai_ask():
    """Ask the AI assistant about a lead"""
    if not ai_assistant or not ai_assistant.available:
        return jsonify({
            'error': 'AI Assistant not available. Check GROQ_API_KEY in .env file.',
            'status': 'error'
        }), 503
    
    try:
        data = request.get_json()
        lead_id = data.get('lead_id')
        question = data.get('question')
        
        if not lead_id or not question:
            return jsonify({
                'error': 'Missing lead_id or question',
                'status': 'error'
            }), 400
        
        response = ai_assistant.ask(lead_id, question)
        return jsonify(response)
        
    except Exception as e:
        logger.error(f"AI assistant error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/ai/summary/<int:lead_id>', methods=['GET'])
def ai_summary(lead_id):
    """Get a brief summary of a lead"""
    if not ai_assistant:
        return jsonify({'error': 'AI Assistant not available'}), 503
    
    try:
        summary = ai_assistant.get_lead_summary(lead_id)
        return jsonify({
            'summary': summary,
            'lead_id': lead_id,
            'status': 'success'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/ai/recommendations/<int:lead_id>', methods=['GET'])
def ai_recommendations(lead_id):
    """Get specific recommendations for a lead"""
    if not ai_assistant:
        return jsonify({'error': 'AI Assistant not available'}), 503
    
    try:
        recommendations = ai_assistant.get_recommendations(lead_id)
        return jsonify({
            'recommendations': recommendations,
            'lead_id': lead_id,
            'status': 'success'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/ai/top-leads', methods=['GET'])
def ai_top_leads():
    """Get top leads for the day"""
    if not ai_assistant:
        return jsonify({'error': 'AI Assistant not available'}), 503
    
    try:
        limit = request.args.get('limit', 5, type=int)
        leads = ai_assistant.get_top_leads(limit)
        return jsonify({
            'leads': leads,
            'count': len(leads),
            'status': 'success'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/ai/health', methods=['GET'])
def ai_health():
    """Check AI Assistant health"""
    return jsonify({
        'available': ai_assistant is not None and ai_assistant.available,
        'provider': 'Groq' if ai_assistant and ai_assistant.available else None,
        'model': ai_assistant.model if ai_assistant else None,
        'status': 'healthy' if ai_assistant and ai_assistant.available else 'unavailable'
    })

# ============================================================
# ROUTES - UTILITY
# ============================================================

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    db_healthy = False
    try:
        with db_connection() as conn:
            conn.execute("SELECT 1")
            db_healthy = True
    except:
        pass
    
    return jsonify({
        'status': 'healthy',
        'model_loaded': model is not None,
        'preprocessor_loaded': preprocessor is not None,
        'database_healthy': db_healthy,
        'ai_available': ai_assistant is not None and ai_assistant.available,
        'timestamp': datetime.now().isoformat(),
        'version': '2.1'
    })

@app.route('/features', methods=['GET'])
def get_features():
    """Get feature information"""
    return jsonify({
        'required_features': REQUIRED_FEATURES,
        'valid_jobs': ['admin.', 'blue-collar', 'entrepreneur', 'housemaid', 
                      'management', 'retired', 'self-employed', 'services', 
                      'student', 'technician', 'unemployed', 'unknown'],
        'valid_months': ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 
                        'jul', 'aug', 'sep', 'oct', 'nov', 'dec'],
        'numeric_features': ['age', 'balance', 'day', 'duration', 
                            'campaign', 'pdays', 'previous']
    })

# ============================================================
# ERROR HANDLERS
# ============================================================

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found', 'status': 'error'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error', 'status': 'error'}), 500

# ============================================================
# MAIN
# ============================================================

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('DEBUG', 'False').lower() == 'true'
    
    # Print startup info
    print("\n" + "="*60)
    print("🚀 LeadScout Server Starting...")
    print("="*60)
    print(f"📡 Port: {port}")
    print(f"🔧 Debug: {debug}")
    print(f"🤖 AI Assistant: {'✅ Available' if ai_assistant and ai_assistant.available else '❌ Not Available'}")
    print("="*60 + "\n")
    
    app.run(debug=debug, host='0.0.0.0', port=port)


