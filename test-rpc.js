const token = 'YOUR_SUPABASE_SECRET_KEY'; // Replace with your actual key from .env
const url = 'https://ntayjobqhpbozamoxgad.supabase.co/rest/v1/rpc/check_duplicate_ticket';

fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': token,
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    p_user_id: '00000000-0000-0000-0000-000000000000',
    p_title: 'test',
    p_description: 'test',
    p_specific_location: 'test',
    p_time_window_hours: 24
  })
})
.then(async r => {
  const data = await r.text();
  console.log(`Status: ${r.status}`);
  console.log(`Body: ${data}`);
})
.catch(console.error);
