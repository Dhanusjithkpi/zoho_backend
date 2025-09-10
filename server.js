const express = require('express');
const cors = require('cors');
const axios = require('axios');
const qs = require('querystring');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Replace with your real Zoho credentials
const client_id = '1000.6LTHFSIR27ZNNY97ZKGCDO02554DDF';
const client_secret = '62b3b67290767f5fdb04d6f6c6af3fd94eca5d12d1';
// Live redirect URI for deployed backend
const redirect_uri = 'https://zoho-backend-ipx6.onrender.com/oauth/callback';
// Local redirect URI for dev
// const redirect_uri = 'http://localhost:3000/oauth/callback';

const TOKEN_FILE = path.join(__dirname, 'zoho_tokens.json');

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

loadTokens();

// CORS config — replace with your frontend origin
const corsOptions = {
  origin: [
    'http://localhost:4200',
    'https://development.infithra.com',
    'https://infithra.com'
  ], // <-- change this to your frontend URL or use '*' to allow all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());


// Test route
app.get('/', (req, res) => {
  res.send('✅ Zoho backend is running');
});

// Step 1: Redirect to Zoho for user consent
app.get('/auth', (req, res) => {
  const url = `https://accounts.zoho.com/oauth/v2/auth?scope=AaaServer.profile.Read,ZohoCRM.modules.ALL,ZohoCRM.settings.layouts.ALL&client_id=${client_id}&response_type=code&access_type=offline&redirect_uri=${redirect_uri}`;
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

// Manual refresh endpoint (optional)
app.get('/refresh-token', async (req, res) => {
  await refreshAccessToken();
  res.send('✅ Access token refreshed manually');
});

// API endpoint to submit contact to Zoho
  app.post('/api/submit-contact', async (req, res) => {
    const rawContact = req.body.contact || {};
    console.log('Received contact:', rawContact);

    const contact = {
      FirstName: rawContact.Firstname || rawContact.FirstName || '',
      LastName: rawContact.Lastname || rawContact.LastName || 'Not Provided',
      Email: rawContact.Email,
      Phone: rawContact.Phone || '',
      Company: rawContact.Company || 'Individual',
      Hearaboutus: rawContact.Hearaboutus,
      PageIdentification: rawContact.PageIdentification,
      empoly: rawContact.NoofEmployees,
      folowup: rawContact.Followup,
      // empoly: rawContact.testEmployees,
    };

    const zohoData = {
      data: [
        {
          layout: {
            id: "6856326000000779001"
          },
          First_Name: contact.FirstName,
          Last_Name: contact.LastName,
          Email: contact.Email,
          Phone: contact.Phone,
          Company: contact.Company,
          Hear_about_us: contact.Hearaboutus,
          Page_Identification: contact.PageIdentification,
          Number_of_Employees: contact.empoly,
          Email_Opt_Out:contact.folowup,
          Lead_Source: 'Website Contact Form',
        }
      ]
    };

    async function submitToZoho() {
      console.log('Submitting to Zoho:', zohoData);

      return await axios.post('https://www.zohoapis.com/crm/v2/Leads', zohoData, {
        headers: {
          Authorization: `Zoho-oauthtoken ${access_token}`,
          'Content-Type': 'application/json'
        }
      });
    }

    try {
      const createResponse = await submitToZoho();

      return res.status(200).json({
        status: 'success',
        message: 'Contact submitted successfully',
        data: createResponse.data
      });

    } catch (error) {
      console.error('🚨 Submit attempt failed:', error.response?.status);

      if (error.response?.status === 401 && refresh_token) {
        console.log('🔄 Attempting token refresh...');
        await refreshAccessToken();

        try {
          const retryResponse = await submitToZoho();

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

      return res.status(500).json({
        status: 'error',
        message: 'Failed to submit contact to Zoho',
        error: error.response?.data || error.message
      });
    }
  });

// Refresh token every 55 minutes
setInterval(() => {
  refreshAccessToken();
}, 55 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
