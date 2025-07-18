const express = require('express');
const cors = require('cors');
const axios = require('axios');
const qs = require('querystring');

const app = express();
const PORT = 3000;

// ✅ Replace these with your real Zoho credentials
const client_id = '1000.B8FFHCUQ749FL1ZDUXJCMZNOAMYS1Z';
const client_secret = '4f4bc636cb2b0c57d062275fa9da98c6b6702f6d37';
const redirect_uri = 'https://zoho-backend-4.onrender.com/oauth/callback';

// ⛔ Access tokens should ideally be stored securely (DB or encrypted file)
let access_token = '';
let refresh_token = '';

app.use(cors());
app.use(express.json()); // Parse JSON body

// 🧪 Test route
app.get('/', (req, res) => {
  res.send('✅ Zoho backend is running');
});

// 🔐 Step 1: Redirect user to Zoho for consent
app.get('/auth', (req, res) => {
  const url = `https://accounts.zoho.com/oauth/v2/auth?scope=AaaServer.profile.Read,ZohoCRM.modules.ALL&client_id=${client_id}&response_type=code&access_type=offline&redirect_uri=${redirect_uri}`;
  res.redirect(url);
});

// 🔑 Step 2: Handle OAuth Callback
app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;
console.log("enter");

console.log(code);

  try {
    const tokenRes = await axios.post('https://accounts.zoho.com/oauth/v2/token', qs.stringify({
      grant_type: 'authorization_code',
      client_id,
      client_secret,
      redirect_uri,
      code,
    }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    access_token = tokenRes.data.access_token;
    refresh_token = tokenRes.data.refresh_token;

    console.log('✅ Access Token:', access_token);
    console.log('🔄 Refresh Token:', refresh_token);

    res.send('✅ Zoho Authentication Successful. You can now submit contacts.');
  } catch (error) {
    console.error('OAuth Error:', error.response?.data || error.message);
    res.status(500).send('❌ Zoho Auth Failed');
  }
});

// 🔁 Optional: Refresh Access Token
async function refreshAccessToken() {
  try {
    const refreshRes = await axios.post('https://accounts.zoho.com/oauth/v2/token', qs.stringify({
      grant_type: 'refresh_token',
      client_id,
      client_secret,
      refresh_token,
    }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    access_token = refreshRes.data.access_token;
    console.log('♻️ Refreshed access token');
  } catch (err) {
    console.error('Token Refresh Error:', err.response?.data || err.message);
  }
}



// app.post('/api/submit-contact',async (req, res) => {
//   console.log('🔔 Zoho Webhook Received:', req.body);
//   res.status(200).send('✅ Webhook received');
// });

// 📥 Submit contact from Angular to Zoho CRM
app.post('/api/submit-contact', async (req, res) => {
  const contact = req.body.contact;

  const zohoData = {
    data: [
      {
        First_Name: contact.FirstName || '',
        Last_Name: contact.LastName || 'Not Provided', // ✅ Must be included
        Email: contact.Email,
        Phone: contact.Phone || '',
        Company: contact.Company || 'Individual',
        Lead_Source: 'Website Contact Form',
        Description: contact.Message || 'Submitted via website'
      }
    ]
  };
  
  

  try {
    const response = await axios.post( 'https://www.zohoapis.com/crm/v2/Leads', zohoData, {
      headers: {
        Authorization: `Zoho-oauthtoken ${access_token}`,
        'Content-Type': 'application/json'
      }
    });

    res.status(200).json({
      status: 'success',
      message: 'Contact submitted successfully',
      data: response.data
    });
  } catch (error) {
    console.error('🚨 Zoho Contact Submit Error:', error.response?.data || error.message);

    if (error.response?.status === 401 && refresh_token) {
      await refreshAccessToken(); // Try to refresh and retry — optional logic
    }

    res.status(500).json({
      status: 'error',
      message: 'Failed to submit contact to Zoho',
      error: error.response?.data || error.message
    });
  }
});

// data geting 

app.get('/api/contact', async (req, res) => {
  try {
    const response = await axios.get(`https://www.zohoapis.com/crm/v2/org`, {
      headers: {
        Authorization: `Zoho-oauthtoken ${access_token}`
      }
    });

    res.json(response.data);
  } catch (err) {
    console.error('Get contact by ID error:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: 'Failed to fetch organization details',
      details: err.response?.data || err.message
    });
  }
});



// webhook 

app.post('/api/send-to-zoho', async (req, res) => {
  try {
    const zohoWebhookUrl = 'https://marketing.zoho.com/api/v1/webhook-url'; // Replace with your actual webhook URL
    const response = await axios.post(zohoWebhookUrl, req.body, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    res.status(200).json({ message: 'Sent to Zoho Webhook', zohoResponse: response.data });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to send to Zoho Webhook' });
  }
});








// ▶️ Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
