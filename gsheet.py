"""
Google Sheets Handler - All Google Sheets API communication
"""
import requests

class GSheet:
    def __init__(self, url, api_key):
        self.url = url
        self.api_key = api_key
    
    def _call(self, action, sheet, data=None, query=None, update_id=None):
        """Make API call to Google Apps Script"""
        payload = {
            'api_key': self.api_key,
            'action': action,
            'sheet': sheet
        }
        
        if data:
            payload['data'] = data
        if query:
            payload['query'] = query
        if update_id:
            payload['id'] = update_id
        
        try:
            response = requests.post(self.url, json=payload, timeout=15)
            result = response.json()
            
            if not result.get('success'):
                print(f"❌ Sheet Error: {result.get('error', 'Unknown')}")
            
            return result
        except Exception as e:
            print(f"❌ Connection Error: {e}")
            return {'success': False, 'data': [], 'error': str(e)}
    
    def insert(self, sheet, data):
        return self._call('insert', sheet, data=data)
    
    def select(self, sheet, query=None):
        return self._call('select', sheet, query=query)
    
    def update(self, sheet, row_id, data):
        return self._call('update', sheet, update_id=row_id, data=data)
    
    def count(self, sheet):
        return self._call('count', sheet)