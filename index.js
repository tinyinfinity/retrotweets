const express = require('express');
const bodyParser = require('body-parser');
const Stripe = require('stripe');
const Lob = require('lob');

const app = express();

const stripe = Stripe('sk_test_51R0cpQBtQhrXA4feAE2o1sSYkve1iTgRBnjtUOgWn2H77kma5CxMzBvib2ms0zwxYCnCfZqi4vPoDcpx6SUr7R2q00K64eMCiN');
const lob = Lob('test_acee9c86a75e1e48b854cf274cef2dcf085');

app.use(express.static('public'));
app.use(bodyParser.json());

app.post('/send-note', async (req, res) => {
  const { noteData, paymentData, paymentMethodId } = req.body;

  console.log('Received request body:', req.body);
  console.log('noteData:', noteData);
  console.log('paymentData:', paymentData);
  console.log('paymentMethodId:', paymentMethodId);

  if (!noteData || !paymentData || !paymentMethodId) {
    console.error('Missing required fields in request body');
    return res.status(400).json({ success: false, error: 'noteData, paymentData, and paymentMethodId are required' });
  }

  try {
    let paymentIntent;
    try {
      console.log('Creating Stripe Payment Intent with:', { paymentMethodId });
      paymentIntent = await stripe.paymentIntents.create({
        amount: 499,
        currency: 'usd',
        payment_method: paymentMethodId,
        payment_method_types: ['card'],
        confirmation_method: 'manual',
        confirm: true,
      });
      console.log('Payment Intent created:', paymentIntent);
    } catch (stripeError) {
      console.error('Stripe error:', stripeError.message, stripeError.stack);
      return res.status(500).json({ success: false, error: 'Stripe payment failed: ' + stripeError.message });
    }

    if (paymentIntent.status === 'succeeded') {
      const toAddress = {
        name: noteData.to_name || 'Unknown Recipient',
        address_line1: noteData.to_address_line1,
        address_city: noteData.to_city,
        address_state: noteData.to_state,
        address_zip: noteData.to_zip,
      };

      const fromAddress = {
        name: paymentData.from_name || 'Unknown Sender',
        address_line1: paymentData.from_address_line1,
        address_city: paymentData.from_city,
        address_state: paymentData.from_state,
        address_zip: paymentData.from_zip,
      };

      console.log('toAddress:', toAddress);
      console.log('fromAddress:', fromAddress);

      const requiredFields = ['address_line1', 'address_city', 'address_state', 'address_zip'];
      const zipRegex = /^\d{5}(-\d{4})?$/;

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

      if (!zipRegex.test(toAddress.address_zip)) {
        console.error('Invalid recipient ZIP code:', toAddress.address_zip);
        return res.status(400).json({ success: false, error: 'Recipient ZIP code must be 5 digits or 5-4 format' });
      }
      if (!zipRegex.test(fromAddress.address_zip)) {
        console.error('Invalid sender ZIP code:', fromAddress.address_zip);
        return res.status(400).json({ success: false, error: 'Sender ZIP code must be 5 digits or 5-4 format' });
      }

     let postcard;
  try {
    const postcardPayload = {
      description: 'Postcard from Write The Leaders',
      to: toAddress,
      from: fromAddress,
      front: `
        <html>
          <head>
            <link href="https://fonts.googleapis.com/css2?family=Bungee+Shade&display=swap" rel="stylesheet">
          </head>
          <body style="width: 1200px; height: 1800px; display: flex; flex-direction: column; justify-content: center; align-items: center; margin: 0;">
            <div style="text-align: center;">
              <h1 style="font-family: 'Bungee Shade', cursive; font-size: 80px; color: #B32113; margin: 20px 0;">
                Write The Leaders
              </h1>
            </div>
          </body>
        </html>
      `,
      back: `
        <html>
          <body style="width: 1200px; height: 1800px; margin: 0;">
            <div style="width: 480px; height: 1800px; padding: 100px; font-family: Arial, sans-serif; font-size: 20px; float: left;">${escapeHtml(noteData.message)}</div>
            <div style="width: 400px; height: 600px; position: absolute; bottom: 0; right: 0;"></div>
          </body>
        </html>
      `,
      use_type: 'operational',
    };
    console.log('Creating Lob postcard with payload:', postcardPayload);
    postcard = await lob.postcards.create(postcardPayload);
    console.log('Postcard created successfully:', postcard);
      } catch (lobError) {
        console.error('Lob error:', lobError.message, lobError.stack);
        if (lobError.response && lobError.response.body) {
          console.error('Lob API response body:', lobError.response.body);
        }
        return res.status(500).json({ success: false, error: 'Lob postcard creation failed: ' + lobError.message });
      }

      res.json({
        success: true,
        postcard: {
          id: postcard.id,
          to: postcard.to,
          message: noteData.message,
          expected_delivery_date: postcard.expected_delivery_date,
          pdf_url: postcard.url
        },
        payment: {
          amount: paymentIntent.amount / 100,
          currency: paymentIntent.currency,
          payment_id: paymentIntent.id
        }
      });
    } else {
      console.error('Payment Intent status:', paymentIntent.status);
      return res.status(400).json({ success: false, error: 'Payment failed' });
    }
  } catch (error) {
    console.error('Unexpected error in /send-note:', error.message, error.stack);
    return res.status(500).json({ success: false, error: 'Internal server error: ' + error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

function escapeHtml(text) {
  if (!text) return ''; // Handle null/undefined input
  return text
    .replace(/&/g, '&amp;')  // Escape ampersands first
    .replace(/</g, '&lt;')   // Escape less-than
    .replace(/>/g, '&gt;')   // Escape greater-than
    .replace(/"/g, '&quot;') // Escape double quotes
    .replace(/'/g, '&apos;'); // Escape single quotes (fixed line)
}
