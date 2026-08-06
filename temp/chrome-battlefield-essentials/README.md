# Battlefield Highlighter Essentials

Minimal Chrome version of the original extension, stripped down to just:

- Battlefield page filters with an injected on-page control bar
- Referer header override for requests to `https://main.gatewa.rs/*`
- Local ONNX PIN decoding and login-field autofill

## Included Features

### Battlefield filters

The content script injects a small filter bar on battlefield pages with:

- `Hide inactive`
- `Treasury >=`
- `Army >=`
- `Hide no-attack`

This version intentionally removes the scanner, popup-based battlefield
settings, and other non-essential features.

### Login PIN autofill

On the Main login page, the extension watches for the login modal, decodes its
PIN GIF locally with the bundled V2 ONNX model, and fills `input#PIN`. It does
not submit the form, apply a confidence threshold, store predictions, or send
the image anywhere. Reopening the modal or loading a new PIN triggers decoding
again.

### Referer override

The popup only controls the referer override:

- Enable or disable the override
- Set the referer URL value

Implementation note: this Chrome build uses Manifest V3 and a `declarativeNetRequest` session rule instead of the Firefox `webRequest` blocking approach.

## Folder

Load this folder in Chrome:

`temp/chrome-battlefield-essentials`

## Install In Chrome

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select the `temp/chrome-battlefield-essentials` folder from this repository.

## How To Use

### Battlefield filters

1. Open a battlefield page on `main.gatewa.rs`.
2. Use the injected filter bar above or near the battlefield table.
3. Changes apply immediately.

### Referer override

1. Click the extension icon in Chrome.
2. Enable or disable `Enable referer override`.
3. Adjust the referer URL if needed.
4. The service worker updates the Chrome rule automatically.

## Files

- `manifest.json`: Chrome Manifest V3 definition
- `content.js`: on-page battlefield filter UI and row filtering
- `pin-autofill.js`: browser preprocessing, ONNX inference, and PIN field fill
- `models/` and `vendor/`: generated model and ONNX Runtime Web assets
- `service-worker.js`: referer override rule management
- `popup.html` and `popup.js`: referer override settings UI
