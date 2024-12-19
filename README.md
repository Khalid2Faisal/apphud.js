# ApphudSDK Guide

The `ApphudSDK` provides a powerful and flexible way to manage in-app purchases, paywalls, placements, and user data for your web application. This guide will walk you through setup, initialization, and key usage scenarios using the SDK, with examples based on the provided sample code.

---

## Table of Contents

1. [Installation](#installation)
2. [SDK Initialization](#sdk-initialization)
3. [Event Tracking](#event-tracking)
4. [User Management](#user-management)
5. [Managing Products and Variables](#managing-products-and-variables)
6. [Payment Form Integration](#payment-form-integration)
7. [Handling Placements](#handling-placements)
8. [Apphud Variables](#working-with-data-aph-var)
9. [Listening events](#listening-to-events-with-apphudon)

---

## Installation

To start using the ApphudSDK, include the SDK JavaScript file in your project. You can download the SDK or include it via a `<script>` tag.

```html
<script src="https://js.apphud.com/web/v1/apphud.js"></script>
```

---

## SDK Initialization

The first step is to initialize the SDK with your API key. This must be done as soon as your application starts.

### Example:
```javascript
await apphud.init({
  apiKey: "your_api_key_here",
  debug: true,
});
```

**Parameters:**
- `apiKey`: Your Apphud API key.
- `debug`: Enables logging for debugging purposes.

---

## Event Tracking

Use the `track` method to log user events in your application. You can pass event-specific data as a parameter.

### Example:

HTML
```html
<button id="track-event" data-event-name="any-event-name">Track!</button>
```

JS
```javascript
document.getElementById('track-event').addEventListener('click', (e) => {
  apphud.track('button_click', { buttonName: e.target.dataset.eventName }, { age: 29 });
});
```

---

## User Management

The SDK allows you to manage user details such as email. Use the `setEmail` method to save a user's email address.

### Example:
HTML
```html
<input type="email" placeholder="Email" id="email-input" />
<button id="save-email-button">Submit</button>
```

JS
```javascript
const emailInput = document.getElementById('email-input');
const saveEmailButton = document.getElementById('save-email-button');

saveEmailButton.addEventListener('click', async () => {
  await apphud.setEmail(emailInput.value);
});
```

---

## Managing Products and Variables

You can dynamically load and manage product variables and selections using the SDK. Use `selectPlacementProduct` and `operateVariables` to handle product updates.

### Example:
HTML
```html
<div class="products" id="products">
  <button class="active" data-product-index="0">
    <s><span class="old-price" data-aph-var="main_web,0,old-price"></span></s> <span data-aph-var="main_web,0,new-price">$~</span>
  </button>
  <button data-product-index="1">
    <s><span class="old-price" data-aph-var="main_web,1,old-price"></span></s> <span data-aph-var="main_web,1,new-price">$~</span>
  </button>
  <button data-product-index="2">
    <s><span class="old-price" data-aph-var="main_web,2,old-price"></span></s> <span data-aph-var="main_web,2,new-price">$~</span>
  </button>
</div>
```
JS
```javascript
const productsContainer = document.getElementById('products');
const productButtons = productsContainer.querySelectorAll('button');

productButtons.forEach(button => {
  button.addEventListener('click', () => {
    // Update active product
    productButtons.forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');

    // Update SDK product and reload variables
    apphud.selectPlacementProduct(apphud.currentPlacement().identifier, button.dataset.productIndex);
    apphud.operateVariables();
  });
});
```

---

## Payment Form Integration

The `paymentForm` method is used to display the payment form for the selected product.

### Example:
HTML
```html
<form id="apphud-payment-form">
    <div id="payment-element">
        <!-- here will be printed form from payment provider like stripe / paddle -->
    </div>
    <button id="submit">Subscribe</button>
    <div id="error-message">
        <!-- here will be printed form validation errors -->
    </div>
</form>
```
JS
```javascript
apphud.paymentForm();
```

**Optional parameters:**
- `successUrl`: Redirect URL after successful payment.
- `failureUrl`: Redirect URL after payment failure.

---

## Handling Placements

Placements are used to group products and paywalls. Use `currentPlacement` and related methods to manage placements.

### Example:
```javascript
const currentPlacement = apphud.currentPlacement();
console.log("Current placement:", currentPlacement.identifier);
```

## Working with `data-aph-var`

The `data-aph-var` attribute in the Apphud SDK allows you to dynamically display variables from selected products or specific placements. This is especially useful for personalizing the user interface with real-time product details such as prices, descriptions, or other properties.

### Syntax

The syntax for `data-aph-var` is:

```
data-aph-var="placement_identifier,productIndex,varName"
```

**Parameters:**
- `placement_identifier` *(string)*: The identifier of the placement where the product resides.
    - Omit this value if you want to work with the currently selected placement.
- `productIndex` *(number)*: The index of the product within the placement.
    - Use `-1` to refer to the currently selected product.
- `varName` *(string)*: The name of the variable to display.

### Displaying Variables from the Selected Product

To display a variable from the currently selected product, set `placement_identifier` to an empty string or omit it, and set `productIndex` to `-1`. For example:

```html
<span data-aph-var=",-1,varName"></span>
```

In this example:
- `varName` will be replaced by the corresponding variable value from the selected product.

### Example Usage

Here’s an example of how you might use `data-aph-var` in your HTML:

```html
<div>
  <p>Old Price: <span data-aph-var=",-1,old-price"></span></p>
  <p>New Price: <span data-aph-var=",-1,new-price"></span></p>
</div>
```

### Displaying Variables from a Specific Product

If you want to display a variable from a specific product (rather than the currently selected one), specify the `placement_identifier` and `productIndex`. For example:

```html
<div>
  <p>Old Price: <span data-aph-var="main_web,0,old-price"></span></p>
  <p>New Price: <span data-aph-var="main_web,0,new-price"></span></p>
</div>
```

### Dynamic Updates

The Apphud SDK provides the method `apphud.operateVariables()` to automatically update all elements with `data-aph-var` attributes based on the current state. Call this method after changing the selected product to refresh the displayed variables.

### Example JavaScript

Here’s an example of updating variables dynamically when the product is changed:

```javascript
// Update variables after selecting a product
apphud.selectPlacementProduct("main_web", 1); // Select a product
apphud.operateVariables(); // Refresh displayed variables
```

By using `data-aph-var` effectively, you can create a highly dynamic and personalized user experience by displaying product-specific data in real-time.


## Listening to Events with `apphud.on`

The `apphud.on` method allows you to listen for lifecycle events emitted by the Apphud SDK. This is useful for reacting to specific moments in the SDK's lifecycle, such as when it has been initialized or when a payment form is ready.

### Syntax

```javascript
apphud.on(eventName, callback);
```

**Parameters:**
- `eventName` *(string)*: The name of the lifecycle event you want to listen to.
- `callback` *(function)*: The function to execute when the event is emitted. The callback receives an event object as its parameter.

### Available Events

The following lifecycle events can be listened to:

- **`"ready"`**: Triggered when the SDK is fully initialized and ready to use.
- **`"payment_form_initialized"`**: Triggered when the payment form has been successfully initialized.
- **`"payment_form_ready"`**: Triggered when the payment form is fully ready and displayed to the user.
- **`"payment_success"`**: Triggered after a successful payment.
- **`"payment_failure"`**: Triggered when a payment fails.
- **`"product_changed"`**: Triggered when user chooses product.

### Example Usage

Here’s an example of how to listen for events and handle them using `apphud.on`:

```javascript
// Listen for when the SDK is initialized
apphud.on("ready", () => {
  console.log("Apphud SDK ready!");
  // You can start using SDK methods now
});

// Listen for when the payment form is ready
apphud.on("payment_form_ready", (event) => {
  console.log("Payment form is ready:", event);
});

// Listen for successful payments
apphud.on("payment_success", (event) => {
  console.log("Payment was successful:", event);
  alert("Thank you for your purchase!");
});

// Listen for failed payments
apphud.on("payment_failure", (event) => {
  console.error("Payment failed:", event);
  alert("Unfortunately, the payment failed. Please try again.");
});
```

By using these event listeners, you can create a seamless user experience by responding dynamically to changes in the Apphud SDK lifecycle.

---

## Debugging

Enable debugging by setting `debug: true` during initialization. Logs will appear in the browser console.

---

This guide provides an overview of how to use the ApphudSDK for common tasks. For advanced features and configurations, refer to the SDK’s full API documentation.
