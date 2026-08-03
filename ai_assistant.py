# ============================================================
# ai_assistant.py - Groq AI Lead Assistant (Using Requests)
# ============================================================

import os
import json
import sqlite3
import requests
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# ============================================================
# AI LEAD ASSISTANT CLASS
# ============================================================

class AILeadAssistant:
    """AI Assistant using Groq API via Requests"""
    
    def __init__(self, db_path='leads.db'):
        self.db_path = db_path
        self.api_key = os.environ.get('GROQ_API_KEY')
        self.model = 'llama-3.1-8b-instant' # Free Groq model
        self.base_url = "https://api.groq.com/openai/v1/chat/completions"
        
        # Check if API key exists
        if not self.api_key:
            print("❌ GROQ_API_KEY not found in .env file")
            self.available = False
        else:
            self.available = True
            print(f"✅ Groq API ready! (Model: {self.model})")
    
    def _get_db_connection(self):
        """Get database connection"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn
    
    def get_lead_data(self, lead_id):
        """Fetch all data about a lead"""
        conn = self._get_db_connection()
        cursor = conn.cursor()
        
        lead = cursor.execute('''
            SELECT * FROM leads WHERE id = ?
        ''', (lead_id,)).fetchone()
        
        conn.close()
        
        if not lead:
            return None
        
        client_data = json.loads(lead['client_data'])
        
        return {
            'id': lead['id'],
            'client': client_data,
            'prediction': lead['prediction'],
            'probability': lead['probability_yes'],
            'confidence': lead['confidence'],
            'priority': lead['priority'],
            'timestamp': lead['timestamp']
        }
    
    def build_context(self, lead_id):
        """Build rich context for AI prompt"""
        lead = self.get_lead_data(lead_id)
        
        if not lead:
            return None
        
        client = lead['client']
        
        context = f"""LEAD INFORMATION:
- ID: {lead['id']}
- Job: {client.get('job', 'Unknown')}
- Age: {client.get('age', '?')}
- Education: {client.get('education', 'Unknown')}
- Marital Status: {client.get('marital', 'Unknown')}
- Account Balance: ₦{client.get('balance', 0):,}
- Housing Loan: {client.get('housing', 'No')}
- Personal Loan: {client.get('loan', 'No')}

PREDICTION:
- Will Subscribe: {lead['prediction']}
- Probability: {lead['probability']}%
- Confidence: {lead['confidence']}%
- Priority: {lead['priority']}

HISTORY:
- Previous Outcome: {client.get('poutcome', 'Unknown')}
- Previous Contacts: {client.get('previous', 0)}
- Campaign Attempts: {client.get('campaign', 0)}
"""
        
        return {
            'context': context,
            'lead_data': lead
        }
    
    def ask(self, lead_id, question):
        """Ask a question about a lead with better formatting"""
        context_data = self.build_context(lead_id)
        if not context_data:
            return {'answer': f"❌ Lead #{lead_id} not found.", 'status': 'error'}
        if not self.available:
            return {'answer': "❌ Groq API key not configured.", 'status': 'error'}
        
        prompt = f"""You are LeadScout AI, a sales advisor for bank telemarketing.
    Answer questions based ONLY on the provided lead data.

    {context_data['context']}

    USER QUESTION: {question}

    INSTRUCTIONS:
    1. Be specific and data-driven
    2. Provide actionable recommendations
    3. Use a professional tone
    4. Reference specific numbers from the data
    5. Format your response with clear sections using markdown:
    - Use **bold** for headings
    - Use bullet points for lists
    - Use numbered lists for steps
    - Keep paragraphs short and readable
    6. If unsure, say so

    ANSWER:
    """
        
        try:
            response = requests.post(
                self.base_url,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": self.model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.7,
                    "max_tokens": 800
                },
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                answer = result['choices'][0]['message']['content']
                # Clean up formatting
                answer = self._clean_formatting(answer)
            else:
                answer = f"❌ API Error ({response.status_code}): {response.text[:200]}"
                
        except Exception as e:
            answer = f"❌ AI Error: {str(e)}"
        
        return {
            'answer': answer,
            'lead_id': lead_id,
            'question': question,
            'lead_data': context_data['lead_data'],
            'timestamp': datetime.now().isoformat(),
            'status': 'success'
        }

    def _clean_formatting(self, text):
        """Clean and improve formatting"""
        # Ensure proper markdown formatting
        lines = text.split('\n')
        cleaned = []
        for line in lines:
            # Clean up extra spaces
            line = line.strip()
            if line:
                cleaned.append(line)
        return '\n\n'.join(cleaned)
    
    def get_top_leads(self, limit=5):
        """Get top N leads for the day"""
        conn = self._get_db_connection()
        cursor = conn.cursor()
        
        leads = cursor.execute('''
            SELECT id, client_data, prediction, probability_yes, priority
            FROM leads
            WHERE prediction = 'Yes'
            ORDER BY probability_yes DESC, confidence DESC
            LIMIT ?
        ''', (limit,)).fetchall()
        
        conn.close()
        
        result = []
        for lead in leads:
            client = json.loads(lead['client_data'])
            result.append({
                'id': lead['id'],
                'job': client.get('job', 'Unknown'),
                'age': client.get('age', '?'),
                'balance': client.get('balance', 0),
                'probability': lead['probability_yes'],
                'priority': lead['priority']
            })
        
        return result
    
    def get_lead_summary(self, lead_id):
        """Get a brief summary of a lead"""
        lead = self.get_lead_data(lead_id)
        
        if not lead:
            return f"❌ Lead #{lead_id} not found."
        
        client = lead['client']
        
        return f"""📊 **Lead #{lead['id']} Summary**

👤 **Client:** {client.get('job', 'Unknown')} · {client.get('age', '?')} years old
🎓 **Education:** {client.get('education', 'Unknown')}
💍 **Status:** {client.get('marital', 'Unknown')}

💰 **Financial:**
- Balance: ₦{client.get('balance', 0):,}
- Housing Loan: {client.get('housing', 'No')}
- Personal Loan: {client.get('loan', 'No')}

🎯 **Prediction:** {lead['prediction']} ({lead['probability']}% confidence)
📊 **Priority:** {lead['priority']}

📞 **History:**
- Previous Outcome: {client.get('poutcome', 'Unknown')}
- Contacts: {client.get('previous', 0)}
- Campaign Attempts: {client.get('campaign', 0)}"""
    
    def get_recommendations(self, lead_id):
        """Get specific recommendations for a lead"""
        lead = self.get_lead_data(lead_id)
        
        if not lead:
            return [f"❌ Lead #{lead_id} not found."]
        
        client = lead['client']
        recommendations = []
        
        if client.get('balance', 0) > 5000:
            recommendations.append("💰 High balance client - suggest premium investment products")
        
        if client.get('poutcome') == 'success':
            recommendations.append("✅ Previous success - reference this in conversation")
        
        if client.get('duration', 0) > 300:
            recommendations.append("📞 Previous long call - client is engaged")
        
        if client.get('job') in ['management', 'admin.', 'entrepreneur']:
            recommendations.append("👔 Professional client - use business language")
        
        if client.get('education') == 'tertiary':
            recommendations.append("🎓 Highly educated - use technical terms")
        
        if client.get('age', 0) > 55:
            recommendations.append("📅 Senior client - emphasize security")
        
        if client.get('previous', 0) > 2:
            recommendations.append("🔄 Multiple contacts - be concise")
        
        if not recommendations:
            recommendations.append("💡 New lead - build rapport first")
        
        recommendations.append("🎯 Focus on the premium term deposit (8.5% interest)")
        
        return recommendations

# ============================================================
# DATABASE HELPER
# ============================================================

def init_ai_database(db_path='leads.db'):
    """Ensure database has necessary tables"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='leads'")
    if not cursor.fetchone():
        cursor.execute('''
            CREATE TABLE leads (
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
    
    conn.commit()
    conn.close()

# ============================================================
# TEST THE ASSISTANT
# ============================================================

if __name__ == '__main__':
    print("\n" + "="*60)
    print("🤖 Testing Groq AI Lead Assistant")
    print("="*60)
    
    # Initialize
    init_ai_database()
    assistant = AILeadAssistant()
    
    if not assistant.available:
        print("\n❌ Groq not available. Check:")
        print("1. Did you create .env with GROQ_API_KEY?")
        print("2. Is your API key correct?")
        exit()
    
    # Test with top leads
    print("\n📊 Fetching top leads...")
    top_leads = assistant.get_top_leads(3)
    
    if top_leads:
        print(f"✅ Found {len(top_leads)} leads")
        lead_id = top_leads[0]['id']
        
        print(f"\n💬 Testing with Lead #{lead_id}")
        print("-"*40)
        
        response = assistant.ask(lead_id, "What recommendations do you have for this lead?")
        print(f"📝 Question: {response['question']}")
        print(f"🤖 Answer:\n{response['answer'][:500]}...")
        
        print("\n✅ AI Assistant test complete!")
    else:
        print("❌ No leads found. Make some predictions first.")