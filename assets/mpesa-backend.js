// ════════════════════════════════════════════════════════════════
// DUKA POS - M-PESA DARAJA API INTEGRATION - Node.js Backend
// Updated with REAL SANDBOX credentials from Python utils/mpesa_payment.py
// ════════════════════════════════════════════════════════════════

const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// ──────────────────────────────────────────────────────────────
// M-PESA CONFIGURATION (SANDBOX - from your Python file)
// ──────────────────────────────────────────────────────────────
const MPESA_CONFIG = {
    CONSUMER_KEY: 'plaDjfd2F8mzQAI0DnMJDr6Yr1W7cAGgOpBEAhKs3UKTgaiq',
    CONSUMER_SECRET: 'kJF7MYqP9Y7ZVFirI8Fr6l1JdpDzpZTfyuAHtnGPsjvNyBiKHXlVoIOG0olK3GKs',
    BUSINESS_SHORT_CODE: '400200',          // Sandbox Paybill number
    PASSKEY: 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919',
    CALLBACK_URL: 'https://yourdomain.com/api/mpesa/callback', // ← CHANGE THIS to your real callback URL

    // Sandbox URLs
    AUTH_URL: 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
    STK_PUSH_URL: 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
    QUERY_URL: 'https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query'
};

// In-memory storage for payment status (use Redis/DB in production)
const paymentStatus = new Map();

// ──────────────────────────────────────────────────────────────
// GET ACCESS TOKEN
// ──────────────────────────────────────────────────────────────
async function getAccessToken() {
    try {
        const auth = Buffer.from(
            `${MPESA_CONFIG.CONSUMER_KEY}:${MPESA_CONFIG.CONSUMER_SECRET}`
        ).toString('base64');

        const response = await axios.get(MPESA_CONFIG.AUTH_URL, {
            headers: {
                Authorization: `Basic ${auth}`
            }
        });

        return response.data.access_token;
    } catch (error) {
        console.error('Error getting access token:', error.response?.data || error.message);
        throw new Error('Failed to get M-Pesa access token');
    }
}

// ──────────────────────────────────────────────────────────────
// GENERATE TIMESTAMP (YYYYMMDDHHmmss)
// ──────────────────────────────────────────────────────────────
function generateTimestamp() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

// ──────────────────────────────────────────────────────────────
// GENERATE PASSWORD (Base64 encoded: Shortcode + Passkey + Timestamp)
// ──────────────────────────────────────────────────────────────
function generatePassword(timestamp) {
    const data = MPESA_CONFIG.BUSINESS_SHORT_CODE + MPESA_CONFIG.PASSKEY + timestamp;
    return Buffer.from(data).toString('base64');
}

// ──────────────────────────────────────────────────────────────
// FORMAT PHONE NUMBER (254XXXXXXXXX format)
// ──────────────────────────────────────────────────────────────
function formatPhoneNumber(phone) {
    phone = phone.replace(/[\s\-\+]/g, '');

    if (phone.startsWith('0')) {
        phone = '254' + phone.substring(1);
    }

    if (phone.startsWith('7') || phone.startsWith('1')) {
        phone = '254' + phone;
    }

    return phone;
}

// ══════════════════════════════════════════════════════════════
// API ENDPOINTS
// ══════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────────────
// INITIATE STK PUSH (Lipa na M-Pesa Online)
// ──────────────────────────────────────────────────────────────
app.post('/api/mpesa/stk-push', async (req, res) => {
    try {
        const { phone, amount, description = 'Duka POS Payment' } = req.body;

        if (!phone || !amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Valid phone number and amount are required'
            });
        }

        const accessToken = await getAccessToken();
        const timestamp = generateTimestamp();
        const password = generatePassword(timestamp);
        const formattedPhone = formatPhoneNumber(phone);

        // Generate a unique checkout request ID (optional - M-Pesa generates one)
        const checkoutRequestID = 'ws_CO_' + Date.now();

        const stkPushData = {
            BusinessShortCode: MPESA_CONFIG.BUSINESS_SHORT_CODE,
            Password: password,
            Timestamp: timestamp,
            TransactionType: 'CustomerPayBillOnline',
            Amount: Math.ceil(amount), // M-Pesa requires whole numbers
            PartyA: formattedPhone,
            PartyB: MPESA_CONFIG.BUSINESS_SHORT_CODE,
            PhoneNumber: formattedPhone,
            CallBackURL: MPESA_CONFIG.CALLBACK_URL,
            AccountReference: 'DukaPOS-' + Date.now(),
            TransactionDesc: description
        };

        console.log('📤 Sending STK Push to:', formattedPhone, 'Amount:', stkPushData.Amount);

        const response = await axios.post(
            MPESA_CONFIG.STK_PUSH_URL,
            stkPushData,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('✅ STK Push Response:', response.data);

        const actualCheckoutID = response.data.CheckoutRequestID || checkoutRequestID;

        // Store initial status
        paymentStatus.set(actualCheckoutID, {
            status: 'pending',
            phone: formattedPhone,
            amount: amount,
            timestamp: Date.now()
        });

        res.json({
            success: true,
            message: 'STK push sent successfully. Check your phone.',
            checkoutRequestID: actualCheckoutID,
            merchantRequestID: response.data.MerchantRequestID
        });
    } catch (error) {
        console.error('❌ STK Push Error:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data?.errorMessage || 'Failed to initiate payment'
        });
    }
});

// ──────────────────────────────────────────────────────────────
// CHECK PAYMENT STATUS (polling endpoint)
// ──────────────────────────────────────────────────────────────
app.get('/api/mpesa/status/:checkoutRequestID', async (req, res) => {
    const { checkoutRequestID } = req.params;
    const status = paymentStatus.get(checkoutRequestID);

    if (!status) {
        return res.json({
            completed: false,
            success: false,
            message: 'Payment request not found'
        });
    }

    // Auto-timeout after 2 minutes if still pending
    const age = Date.now() - status.timestamp;
    if (age > 120000 && status.status === 'pending') {
        status.status = 'timeout';
        paymentStatus.set(checkoutRequestID, status);
    }

    res.json({
        completed: status.status !== 'pending',
        success: status.status === 'success',
        status: status.status,
        receiptNumber: status.receiptNumber,
        phone: status.phone,
        amount: status.amount
    });
});

// ──────────────────────────────────────────────────────────────
// M-PESA CALLBACK (Webhook) - VERY IMPORTANT
// ──────────────────────────────────────────────────────────────
app.post('/api/mpesa/callback', (req, res) => {
    console.log('📥 M-Pesa CALLBACK RECEIVED:', JSON.stringify(req.body, null, 2));

    try {
        const { Body } = req.body;
        const stkCallback = Body?.stkCallback;

        if (!stkCallback) {
            return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
        }

        const checkoutRequestID = stkCallback.CheckoutRequestID;
        const resultCode = stkCallback.ResultCode;

        if (resultCode === 0) {
            // Payment SUCCESS
            const callbackMetadata = stkCallback.CallbackMetadata?.Item || [];

            const receiptNumber = callbackMetadata.find(item => item.Name === 'MpesaReceiptNumber')?.Value;
            const amount = callbackMetadata.find(item => item.Name === 'Amount')?.Value;
            const phone = callbackMetadata.find(item => item.Name === 'PhoneNumber')?.Value;

            paymentStatus.set(checkoutRequestID, {
                status: 'success',
                receiptNumber,
                phone,
                amount,
                timestamp: Date.now()
            });

            console.log('✅ PAYMENT SUCCESS:', { checkoutRequestID, receiptNumber, amount });
        } else {
            // Payment FAILED / CANCELLED
            paymentStatus.set(checkoutRequestID, {
                status: 'failed',
                resultDesc: stkCallback.ResultDesc,
                timestamp: Date.now()
            });

            console.log('❌ PAYMENT FAILED:', { checkoutRequestID, reason: stkCallback.ResultDesc });
        }

        // Always respond with success to M-Pesa (they retry if not)
        res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    } catch (error) {
        console.error('❌ Callback Processing Error:', error);
        res.json({ ResultCode: 1, ResultDesc: 'Error' });
    }
});

// ──────────────────────────────────────────────────────────────
// QUERY STK PUSH STATUS (manual check fallback)
// ──────────────────────────────────────────────────────────────
app.post('/api/mpesa/query', async (req, res) => {
    try {
        const { checkoutRequestID } = req.body;

        if (!checkoutRequestID) {
            return res.status(400).json({ success: false, error: 'checkoutRequestID is required' });
        }

        const accessToken = await getAccessToken();
        const timestamp = generateTimestamp();
        const password = generatePassword(timestamp);

        const queryData = {
            BusinessShortCode: MPESA_CONFIG.BUSINESS_SHORT_CODE,
            Password: password,
            Timestamp: timestamp,
            CheckoutRequestID: checkoutRequestID
        };

        const response = await axios.post(
            MPESA_CONFIG.QUERY_URL,
            queryData,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        res.json({
            success: true,
            data: response.data
        });
    } catch (error) {
        console.error('Query Error:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to query payment status'
        });
    }
});

// ──────────────────────────────────────────────────────────────
// HEALTH CHECK
// ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({ status: 'OK', service: 'M-Pesa Daraja API' });
});

// ──────────────────────────────────────────────────────────────
// START SERVER
// ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 M-Pesa API Server running on port ${PORT}`);
    console.log(`📱 Callback URL set to: ${MPESA_CONFIG.CALLBACK_URL}`);
    console.log(`\nIMPORTANT: Update CALLBACK_URL in MPESA_CONFIG to your real public URL`);
    console.log(`Current time: ${new Date().toISOString()}`);
});