const axios = require('axios');

// Simulated MTN MoMo API Webhook Payload
// This is exactly what the MTN cloud proxy pushes to our Raspberry Pi when a parent pays via USSD/App

const NODE_RED_WEBHOOK_URL = 'http://localhost:1880/api/momo/webhook';

const paymentPayload = {
    "providerCallbackHost": "schoolflow-pi.local",
    "transactionId": "MOMO_20260408_001A",
    "payer": {
        "partyIdType": "MSISDN",
        "partyId": "237670000000" // Parent's Cameroon MTN Number
    },
    "payeeNote": "Term 2 Fees - Amara Mbeki (Student ID: 1)",
    "payerMessage": "SchoolFlow Payment Successful",
    "amount": "25000",
    "currency": "XAF",
    "status": "SUCCESSFUL"
};

async function simulateMoMoPayment() {
    console.log("💳 Initiating Mock MTN MoMo Webhook...");
    console.log(`Sending to: ${NODE_RED_WEBHOOK_URL}`);
    console.log(`Amount: ${paymentPayload.amount} FCFA for Student ID 1`);

    try {
        const response = await axios.post(NODE_RED_WEBHOOK_URL, paymentPayload);
        console.log("✅ Webhook delivered successfully!");
        console.log(`Node-RED Response: ${response.status} ${response.statusText}`);
        
        // The flow in node-red/flows.json takes this and updates the fees_ledger in Postgres:
        // UPDATE fees_ledger SET amount_paid = amount_paid + 25000 WHERE student_id = 1
        console.log("Ledger updated in local Postgres DB.");

    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.error("❌ Connection Refused: Ensure the Docker stack (Node-RED) is running!");
        } else {
            console.error("❌ Error delivering webhook:", error.message);
        }
    }
}

simulateMoMoPayment();
