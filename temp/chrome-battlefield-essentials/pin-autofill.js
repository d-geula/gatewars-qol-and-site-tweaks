(function () {
  const MODEL_URL = chrome.runtime.getURL('models/pin-decoder-v2.onnx');
  const RUNTIME_ASSET_ROOT = chrome.runtime.getURL('vendor/');
  const CANVAS_WIDTH = 144;
  const CANVAS_HEIGHT = 56;
  const CONTENT_WIDTH = CANVAS_WIDTH - 8;
  const CONTENT_HEIGHT = CANVAS_HEIGHT - 8;
  const LOGIN_PATHS = new Set(['/', '/index.php']);

  if (!LOGIN_PATHS.has(window.location.pathname.toLowerCase())) return;

  let sessionPromise = null;
  let activeSource = '';
  let activePrediction = '';
  let decodingSource = '';

  function roundHalfToEven(value) {
    const floor = Math.floor(value);
    const fraction = value - floor;
    if (Math.abs(fraction - 0.5) < Number.EPSILON * Math.max(1, value)) {
      return floor % 2 === 0 ? floor : floor + 1;
    }
    return Math.round(value);
  }

  function grayscale(red, green, blue) {
    return Math.round((red * 299 + green * 587 + blue * 114) / 1000);
  }

  function createSession() {
    if (!sessionPromise) {
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      ort.env.wasm.wasmPaths = RUNTIME_ASSET_ROOT;
      sessionPromise = ort.InferenceSession.create(MODEL_URL, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all'
      });
    }
    return sessionPromise;
  }

  async function imageTensor(image) {
    if (!image.complete || image.naturalWidth === 0) {
      await image.decode();
    }

    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = image.naturalWidth;
    sourceCanvas.height = image.naturalHeight;
    const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
    sourceContext.drawImage(image, 0, 0);
    const sourcePixels = sourceContext.getImageData(
      0,
      0,
      sourceCanvas.width,
      sourceCanvas.height
    ).data;

    const cornerOffsets = [
      0,
      (sourceCanvas.width - 1) * 4,
      (sourceCanvas.height - 1) * sourceCanvas.width * 4,
      ((sourceCanvas.height * sourceCanvas.width) - 1) * 4
    ];
    const background = Math.round(
      cornerOffsets.reduce((sum, offset) => sum + grayscale(
        sourcePixels[offset],
        sourcePixels[offset + 1],
        sourcePixels[offset + 2]
      ), 0) / cornerOffsets.length
    );

    const scale = Math.min(
      CONTENT_WIDTH / sourceCanvas.width,
      CONTENT_HEIGHT / sourceCanvas.height
    );
    const resizedWidth = Math.max(1, roundHalfToEven(sourceCanvas.width * scale));
    const resizedHeight = Math.max(1, roundHalfToEven(sourceCanvas.height * scale));
    const x = Math.floor((CANVAS_WIDTH - resizedWidth) / 2);
    const y = Math.floor((CANVAS_HEIGHT - resizedHeight) / 2);

    const modelCanvas = document.createElement('canvas');
    modelCanvas.width = CANVAS_WIDTH;
    modelCanvas.height = CANVAS_HEIGHT;
    const modelContext = modelCanvas.getContext('2d', { willReadFrequently: true });
    modelContext.fillStyle = `rgb(${background}, ${background}, ${background})`;
    modelContext.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    modelContext.imageSmoothingEnabled = true;
    modelContext.imageSmoothingQuality = 'medium';
    modelContext.drawImage(sourceCanvas, x, y, resizedWidth, resizedHeight);

    const rgba = modelContext.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).data;
    const input = new Float32Array(CANVAS_WIDTH * CANVAS_HEIGHT);
    for (let pixel = 0, offset = 0; pixel < input.length; pixel += 1, offset += 4) {
      input[pixel] = (grayscale(rgba[offset], rgba[offset + 1], rgba[offset + 2]) / 127.5) - 1;
    }
    return new ort.Tensor('float32', input, [1, 1, CANVAS_HEIGHT, CANVAS_WIDTH]);
  }

  function decodeLogits(logits) {
    const values = logits.data;
    let pin = '';
    for (let slot = 0; slot < 3; slot += 1) {
      const offset = slot * 9;
      let bestClass = 0;
      for (let digitClass = 1; digitClass < 9; digitClass += 1) {
        if (values[offset + digitClass] > values[offset + bestClass]) {
          bestClass = digitClass;
        }
      }
      pin += String(bestClass + 1);
    }
    return pin;
  }

  function fillPin(input, pin) {
    input.value = pin;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function fillLoginPin() {
    const input = document.querySelector('#loginModal input#PIN[name="PIN"]');
    const image = document.querySelector('#loginModal img[alt="PIN"]');
    if (!input || !image) return;

    const source = image.currentSrc || image.src;
    if (!source) return;
    if (source === activeSource && activePrediction) {
      if (input.value !== activePrediction) fillPin(input, activePrediction);
      return;
    }
    if (source === decodingSource) return;

    decodingSource = source;
    try {
      const [session, tensor] = await Promise.all([createSession(), imageTensor(image)]);
      const result = await session.run({ images: tensor });
      const pin = decodeLogits(result.logits);
      activeSource = source;
      activePrediction = pin;
      fillPin(input, pin);
    } catch (error) {
      console.warn('[PIN Autofill] Could not decode the login PIN.', error);
    } finally {
      if (decodingSource === source) decodingSource = '';
    }
  }

  const observer = new MutationObserver(() => {
    void fillLoginPin();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  void fillLoginPin();
})();
