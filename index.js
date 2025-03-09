const express = require('express');
const bodyParser = require('body-parser');
const Stripe = require('stripe');
const Lob = require('lob');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(express.static('public')); // Serve front-end files from 'public'

// Initialize Stripe and Lob with environment variables
const stripe = Stripe('sk_test_51R0cpQBtQhrXA4feAE2o1sSYkve1iTgRBnjtUOgWn2H77kma5CxMzBvib2ms0zwxYCnCfZqi4vPoDcpx6SUr7R2q00K64eMCiN');
const lob = Lob('test_acee9c86a75e1e48b854cf274cef2dcf085');

// Endpoint to handle postcard sending
app.post('/send-note', async (req, res) => {
  const { noteData, paymentData, paymentMethodId } = req.body;

  console.log('noteData:', noteData);
  console.log('paymentData:', paymentData);
  console.log('paymentMethodId:', paymentMethodId);

  try {
    // Create a PaymentIntent with explicit card payment method
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 499, // $4.99 in cents
      currency: 'usd',
      payment_method: paymentMethodId,
      payment_method_types: ['card'], // Restrict to card payments only
      confirmation_method: 'manual',
      confirm: true,
    });

    if (paymentIntent.status === 'succeeded') {
      // Payment successful, send postcard with Lob
      const toAddress = {
        name: noteData.to_name || 'Unknown Recipient',
        address_line1: noteData.address, // Changed from to_address_line1
        address_city: noteData.city,     // Changed from to_city
        address_state: noteData.state,   // Changed from to_state
        address_zip: noteData.zip        // Changed from to_zip
      };

      // Validate required fields
      const requiredFields = ['address_line1', 'address_city', 'address_state', 'address_zip'];
      for (const field of requiredFields) {
        if (!toAddress[field]) {
          return res.json({ success: false, error: `${field} is required` });
        }
      }

      console.log('Sending to Lob with toAddress:', toAddress);

      const postcard = await lob.postcards.create({
        description: 'Postcard from Write The Leaders',
        to: toAddress,
        from: {
          name: paymentData.from_name,
          address_line1: paymentData.from_address_line1,
          address_city: paymentData.from_city,
          address_state: paymentData.from_state,
          address_zip: paymentData.from_zip,
        },
        front: '<html style="padding: 1in; font-size: 50;">Write The Leaders Postcard</html>',
        back: `<html style="padding: 1in; font-size: 20;">${escapeHtml(noteData.message)}</html>`,
      });

      res.json({ success: true, postcard });
    } else {
      res.json({ success: false, error: 'Payment failed' });
    }
  } catch (error) {
    console.error('Error:', error);
    res.json({ success: false, error: error.message });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Function to escape HTML and prevent injection
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
