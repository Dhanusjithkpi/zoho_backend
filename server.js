const express = require('express');
const cors = require('cors');
const axios = require('axios');
const qs = require('querystring');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Replace with your real Zoho credentials
const client_id = '1000.B8FFHCUQ749FL1ZDUXJCMZNOAMYS1Z';
const client_secret = '4f4bc636cb2b0c57d062275fa9da98c6b6702f6d37';
// Live 
// const redirect_uri = 'https://zoho-backend-4.onrender.com/oauth/callback';
// local
const redirect_uri = 'http://localhost:3000/oauth/callback';

// Token storage file (optional for persistence)
const TOKEN_FILE = path.join(__dirname, 'zoho_tokens.json');

// In-memory tokens
let access_token = '';
let refresh_token = '';

// Load tokens from file if available
function loadTokens() {
  if (fs.existsSync(TOKEN_FILE)) {
    const tokens = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'));
    access_token = tokens.access_token;
    refresh_token = tokens.refresh_token;
  }
}

// Save tokens to file
function saveTokens() {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify({ access_token, refresh_token }));
}

// Load tokens on startup
loadTokens();

app.use(cors());
app.use(express.json());

// Test route
app.get('/', (req, res) => {
  res.send('✅ Zoho backend is running');
});

// Step 1: Redirect to Zoho for user consent
app.get('/auth', (req, res) => {
  //  const scope = 'ZohoCRM.modules.leads.ALL';
  const url = `https://accounts.zoho.com/oauth/v2/auth?scope=AaaServer.profile.Read,ZohoCRM.modules.ALL&client_id=${client_id}&response_type=code&access_type=offline&redirect_uri=${redirect_uri}`;
  res.redirect(url);
});
// Step 2: Handle OAuth callback
app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;

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
    saveTokens();

    console.log('✅ Access Token:', access_token);
    console.log('🔄 Refresh Token:', refresh_token);

    res.send('✅ Zoho Authentication Successful. You can now submit contacts.');
  } catch (error) {
    console.error('OAuth Error:', error.response?.data || error.message);
    res.status(500).send('❌ Zoho Auth Failed');
  }
});

// Refresh access token using refresh token
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
    saveTokens();
    console.log('♻️ Access token refreshed!');
  } catch (err) {
    console.error('Refresh Token Error:', err.response?.data || err.message);
  }
}

// ➕ Manual refresh endpoint (optional for testing)
app.get('/refresh-token', async (req, res) => {
  await refreshAccessToken();
  res.send('✅ Access token refreshed manually');
});



app.get('/refresh-token', async (req, res) => {
  await refreshAccessToken();
  res.send('✅ Access token refreshed manually');
});

// API CALL 

app.post('/api/submit-contact', async (req, res) => {
  const rawContact = req.body.contact?.[0] || {};

  // Normalize casing (optional but safer)
  const contact = {
    FirstName: rawContact.Firstname || rawContact.FirstName || '',
    LastName: rawContact.Lastname || rawContact.LastName || 'Not Provided',
    Email: rawContact.Email,
    Phone: rawContact.Phone || '',
    Company: rawContact.Company || 'Individual',
  };

  const zohoData = {
    data: [
      {
        First_Name: contact.FirstName,
        Last_Name: contact.LastName,
        Email: contact.Email,
        Phone: contact.Phone,
        Company: contact.Company,
        Lead_Source: 'Website Contact Form',
      }
    ]
  };


  // Function to submit lead to Zoho
  async function submitToZoho() {
    console.log(zohoData);

    return await axios.post('https://www.zohoapis.com/crm/v2/Leads', zohoData, {
      headers: {
        Authorization: `Zoho-oauthtoken ${access_token}`,
        'Content-Type': 'application/json'
      }
    });
  }

  try {
    // First attempt
    let response = await submitToZoho();

    return res.status(200).json({
      status: 'success',
      message: 'Contact submitted successfully',
      data: response.data
    });

  } catch (error) {
    console.error('🚨 Submit attempt failed:', error.response?.status);

    // If unauthorized, try to refresh token and retry
    if (error.response?.status === 401 && refresh_token) {
      console.log('🔄 Attempting token refresh...');
      await refreshAccessToken();

      try {
        // Retry after refresh
        let retryResponse = await submitToZoho();

        return res.status(200).json({
          status: 'success',
          message: 'Contact submitted successfully after token refresh',
          data: retryResponse.data
        });
      } catch (retryError) {
        console.error('❌ Retry also failed:', retryError.response?.data || retryError.message);
        return res.status(500).json({
          status: 'error',
          message: 'Retry after token refresh failed',
          error: retryError.response?.data || retryError.message
        });
      }
    }

    // All failed
    return res.status(500).json({
      status: 'error',
      message: 'Failed to submit contact to Zoho',
      error: error.response?.data || error.message
    });
  }
});



// Get organization details (just a test)
app.get('/api/contact', async (req, res) => {
  try {
    const response = await axios.get(`https://www.zohoapis.com/crm/v2/org`, {
      headers: {
        Authorization: `Zoho-oauthtoken ${access_token}`
      }
    });

    res.json(response.data);
  } catch (err) {
    console.error('Get contact error:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: 'Failed to fetch organization details',
      details: err.response?.data || err.message
    });
  }
});

// Refresh every 55 minutes (3300000 milliseconds)

setInterval(() => {
  refreshAccessToken();
}, 55 * 60 * 1000);

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
