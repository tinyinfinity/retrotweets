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

      let postcard;
      try {
        console.log('Creating Lob postcard with:', { to: toAddress, from: fromAddress });
        postcard = await lob.postcards.create({
          description: 'Postcard from Write The Leaders',
          to: toAddress,
          from: fromAddress,
          front: 'https://s3-us-west-2.amazonaws.com/public.lob.com/assets/templates/4x6_pc_front.pdf', // Valid test URL
          back: `
            <html>
              <body style="margin: 0; padding: 50px; width: 1200px; height: 1800px; font-family: Arial, sans-serif;">
                <div style="font-size: 20px;">${escapeHtml(noteData.message)}</div>
              </body>
            </html>
          `,
          use_type: 'operational',
        });
        console.log('Postcard created successfully:', postcard);
      } catch (lobError) {
        console.error('Lob error:', lobError.message, lobError.stack);
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
      res.status(400).json({ success: false, error: 'Payment failed' });
    }
  } catch (error) {
    console.error('Unexpected error in /send-note:', error.message, error.stack);
    res.status(500).json({ success: false, error: 'Internal server error: ' + error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '');
}
