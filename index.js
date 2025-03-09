const express = require('express');
const Stripe = require('stripe');
const Lob = require('@lob/lob');
const escapeHtml = require('escape-html');

const app = express();
const stripe = Stripe('sk_test_51R0cpQBtQhrXA4fednR9bKxQzQDlHOaW0NpLBEyG1QbXaZ2eT8nPEvQfOJDpA2sE2oN8zWxZJpF8i5oY4M0XhB8J00KtfN8i5e'); // Replace with your Stripe secret key
const lob = Lob('test_acee9c86a75e1e48b854cf274cef2dcf085'); // Replace with your Lob test API key

app.use(express.static('public'));
app.use(express.json());

app.post('/send-note', async (req, res) => {
  const { noteData, paymentData, paymentMethodId } = req.body;

  // Log incoming data
  console.log('Received request body:', req.body);
  console.log('noteData:', noteData);
  console.log('paymentData:', paymentData);
  console.log('paymentMethodId:', paymentMethodId);

  // Validate noteData structure
  if (!noteData || typeof noteData !== 'object') {
    console.error('noteData is missing or invalid');
    return res.status(400).json({ success: false, error: 'noteData is required' });
  }

  try {
    // Process payment with Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 499, // $4.99 in cents
      currency: 'usd',
      payment_method: paymentMethodId,
      payment_method_types: ['card'],
      confirmation_method: 'manual',
      confirm: true,
    });

    if (paymentIntent.status === 'succeeded') {
      // Construct toAddress from noteData
      const toAddress = {
        name: noteData.to_name || 'Unknown Recipient',
        address_line1: noteData.to_address_line1 || noteData.address || 'N/A', // Fallback to 'address' if used
        address_city: noteData.to_city || noteData.city || 'N/A',
        address_state: noteData.to_state || noteData.state || 'N/A',
        address_zip: noteData.to_zip || noteData.zip || 'N/A'
      };

      // Log the constructed toAddress
      console.log('Constructed toAddress:', toAddress);

      // Validate required fields
      const requiredFields = ['address_line1', 'address_city', 'address_state', 'address_zip'];
      for (const field of requiredFields) {
        if (!toAddress[field] || toAddress[field] === 'N/A') {
          console.error(`Validation failed: ${field} is missing or invalid`);
          return res.status(400).json({ success: false, error: `${field} is required` });
        }
      }

      // Construct fromAddress from paymentData
      const fromAddress = {
        name: paymentData.from_name || 'Unknown Sender',
        address_line1: paymentData.from_address_line1 || 'N/A',
        address_city: paymentData.from_city || 'N/A',
        address_state: paymentData.from_state || 'N/A',
        address_zip: paymentData.from_zip || 'N/A'
      };

      console.log('Constructed fromAddress:', fromAddress);

      // Validate fromAddress required fields
      for (const field of requiredFields) {
        if (!fromAddress[field] || fromAddress[field] === 'N/A') {
          console.error(`Validation failed: ${field} is missing in fromAddress`);
          return res.status(400).json({ success: false, error: `${field} is required for sender address` });
        }
      }

      // Send postcard via Lob
      const postcard = await lob.postcards.create({
        description: 'Postcard from Write The Leaders',
        to: toAddress,
        from: fromAddress,
        front: '<html style="padding: 1in; font-size: 50;">Write The Leaders Postcard</html>',
        back: `<html style="padding: 1in; font-size: 20;">${escapeHtml(noteData.message)}</html>`,
      });

      console.log('Postcard created successfully:', postcard);
      res.json({ success: true, postcard });
    } else {
      console.error('PaymentIntent status:', paymentIntent.status);
      res.status(400).json({ success: false, error: 'Payment failed' });
    }
  } catch (error) {
    console.error('Error in /send-note:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
