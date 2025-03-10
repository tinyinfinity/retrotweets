const express = require('express');
const bodyParser = require('body-parser');
const Stripe = require('stripe');
const Lob = require('lob');

const app = express();

// Initialize Stripe and Lob with your test keys
const stripe = Stripe('sk_test_51R0cpQBtQhrXA4feAE2o1sSYkve1iTgRBnjtUOgWn2H77kma5CxMzBvib2ms0zwxYCnCfZqi4vPoDcpx6SUr7R2q00K64eMCiN');
const lob = Lob('test_acee9c86a75e1e48b854cf274cef2dcf085');

// Middleware
app.use(express.static('public'));
app.use(bodyParser.json());

// Endpoint to handle postcard sending
app.post('/send-note', async (req, res) => {
  const { noteData, paymentData, paymentMethodId } = req.body;

  // Log incoming data for debugging
  console.log('Received request body:', req.body);
  console.log('noteData:', noteData);
  console.log('paymentData:', paymentData);
  console.log('paymentMethodId:', paymentMethodId);

  // Validate request body
  if (!noteData || !paymentData || !paymentMethodId) {
    console.error('Missing required fields in request body');
    return res.status(400).json({ success: false, error: 'noteData, paymentData, and paymentMethodId are required' });
  }

  try {
    // Create and confirm Payment Intent with Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 499, // $4.99 in cents
      currency: 'usd',
      payment_method: paymentMethodId,
      payment_method_types: ['card'],
      confirmation_method: 'manual',
      confirm: true,
    });

    console.log('Payment Intent created:', paymentIntent);

    if (paymentIntent.status === 'succeeded') {
      // Construct recipient (to) address
      const toAddress = {
        name: noteData.to_name || 'Unknown Recipient',
        address_line1: noteData.to_address_line1,
        address_city: noteData.to_city,
        address_state: noteData.to_state,
        address_zip: noteData.to_zip,
      };

      // Construct sender (from) address
      const fromAddress = {
        name: paymentData.from_name || 'Unknown Sender',
        address_line1: paymentData.from_address_line1,
        address_city: paymentData.from_city,
        address_state: paymentData.from_state,
        address_zip: paymentData.from_zip,
      };

      // Validate required fields for both addresses
      const requiredFields = ['address_line1', 'address_city', 'address_state', 'address_zip'];
      for (const field of requiredFields) {
        if (!toAddress[field]) {
          console.error(`Missing required field in toAddress: ${field}`);
          return res.status(400).json({ success: false, error: `${field} is required for recipient address` });
        }
        if (!fromAddress[field]) {
          console.error(`Missing required field in fromAddress: ${field}`);
          return res.status(400).json({ success: false, error: `${field} is required for sender address` });
        }
      }

      // Create postcard with Lob
      const postcard = await lob.postcards.create({
        description: 'Postcard from Write The Leaders',
        to: toAddress,
        from: fromAddress,
        front: 'https://www.1zoom.me/big2/38/173437-frederika.jpg', // Replace with your actual URL
        back: `
          <html>
            <style>
              body {
                margin: 0;
                padding: 0;
                width: 1200px;
                height: 1800px;
                font-family: Arial, sans-serif;
              }
              .message-container {
                width: 400px;
                height: 1800px;
                padding: 50px;
                box-sizing: border-box;
                font-size: 20px;
                word-wrap: break-word;
                float: left;
              }
              .address-area {
                width: 400px;
                height: 600px;
                position: absolute;
                bottom: 0;
                right: 0;
                background: transparent;
              }
            </style>
            <body>
              <div class="message-container">${escapeHtml(noteData.message)}</div>
              <div class="address-area"></div>
            </body>
          </html>
        `,
        use_type: 'operational',
      });

      console.log('Postcard created successfully:', postcard);

      // Return enhanced JSON response
      res.json({
        success: true,
        postcard: {
          id: postcard.id,
          to: postcard.to, // Full "to" address object
          message: noteData.message,
          expected_delivery_date: postcard.expected_delivery_date,
          pdf_url: postcard.url // PDF proof link
        },
        payment: {
          amount: paymentIntent.amount / 100, // Convert cents to dollars
          currency: paymentIntent.currency,
          payment_id: paymentIntent.id
        }
      });
    } else {
      console.error('Payment Intent status:', paymentIntent.status);
      res.status(400).json({ success: false, error: 'Payment failed' });
    }
  } catch (error) {
    console.error('Error in /send-note:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Custom escapeHtml function
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, ''); // Fixed: Removed extra quote
}
