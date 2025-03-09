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
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const lob = Lob(process.env.LOB_API_KEY);

// Endpoint to handle postcard sending
app.post('/send-note', async (req, res) => {
  const { noteData, paymentData, paymentMethodId } = req.body;

  try {
    // Create and confirm a payment intent with Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 499, // $4.99 in cents
      currency: 'usd',
      payment_method: paymentMethodId,
      confirmation_method: 'manual',
      confirm: true,
    });

    if (paymentIntent.status === 'succeeded') {
      // Payment successful, send postcard with Lob
      const postcard = await lob.postcards.create({
        description: 'Postcard from Write The Leaders',
        to: {
          name: noteData.to_name,
          address_line1: noteData.to_address_line1,
          address_city: noteData.to_city,
          address_state: noteData.to_state,
          address_zip: noteData.to_zip,
        },
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
