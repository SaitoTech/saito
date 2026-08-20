const ModTemplate = require('../../lib/templates/modtemplate');
const UserMenu = require('./../../lib/saito/ui/modals/user-menu/user-menu');

const HeaderDropdownTemplate = (dropdownmods) => {
  html = dropdownmods.map((mod) => {
    if (mod.returnLink() != null) {
      return `<a href="${mod.returnLink()}"><li>${mod.name}</li></a>`;
    }
  });
  return `
  <div id="modules-dropdown" class="header-dropdown">
    <ul>${html}</ul>
  </div>`;
};

class QRScanner extends ModTemplate {
  constructor(app) {
    super(app);

    this.name = 'QRScanner';
    this.slug = 'qrscanner';
    this.description = 'Adds QRCode scanning functionality to Saito';
    this.categories = 'Core';
    this.video = null;
    this.canvas = null;
    this.canvas_context = null;
    this.isStreamInit = false;

    this.styles = ['/qrscanner/style.css'];
    this.scanner_callback = null;

    this.dependencies = ['Encrypt']; // For scan to add encrypted contact
    this.description = 'Helper module with QR code scanning functionality.';
    this.categories = 'Dev Data Utilities';
    this.class = 'utility';
    this.constraints = {
      audio: false,
      video: {
        facingMode: 'environment'
      }
    };

    // quirc wasm version
    this.decoder = null;
    this.decoder_timeout = null;
    this.scan_session = 0;
    this.last_scanned_raw = null;
    this.last_scanned_at = null;

    // In milliseconds
    this.debounce_timeout = 750;

    this.events = ['encrypt-key-exchange-confirm'];

    //
    // and scan when asked
    //
    this.app.connection.on('scanner-start-scanner', (callback = null) => {
      this.startScanner(callback);
    });
  }

  initialize(app) {
    super.initialize(app);
    if (app.BROWSER == 1) {
      this.attachStyleSheets();
    }
  }

  respondTo(type = '') {
    if (type === 'saito-header') {
      const mobileViewport = typeof window !== 'undefined' && window.innerWidth <= 620;
      if (this.app.browser.isMobileBrowser() || mobileViewport) {
        return [
          {
            text: 'Scan',
            icon: 'fa-solid fa-qrcode',
            rank: 110,
            type: 'utilities',
            callback: function (app) {
              app.connection.emit('scanner-start-scanner');
            }
          }
        ];
      }
    }

    return super.respondTo(type);
  }

  attachEvents(app) {
    let scanner_self = this;
    document.querySelector('.qrscanner-launch')?.addEventListener('click', function (e) {
      scanner_self.startScanner();
    });
  }

  startQRDecoderInitializationLoop(scanSession) {
    if (scanSession !== this.scan_session || !this.decoder) {
      return;
    }

    const decoderStarted = this.attemptQRDecode();

    if (decoderStarted !== 1) {
      this.decoder_timeout = setTimeout(() => {
        this.decoder_timeout = null;
        this.startQRDecoderInitializationLoop(scanSession);
      }, 100);
    }
  }

  //
  // turns BODY into the scanner
  //
  startScanner(mycallback = null) {
    if (this.app.BROWSER == 0) {
      return;
    }
    if (typeof document === 'undefined') {
      return;
    }
    if (document.querySelector('.qrscanner-container')) {
      return;
    }

    if (mycallback != null) {
      this.scanner_callback = mycallback;
    }

    this.app.browser.addElementToDom(this.returnScannerHTML());
    //document.body.innerHTML = this.returnScannerHTML();
    document.querySelector('.close-scanner').onclick = () => {
      document.querySelector('.qrscanner-container').remove();
      this.stop();
    };

    let scanner_self = this;
    scanner_self.start(document.getElementById('qr-video'), document.getElementById('qr-canvas'));
  }

  //
  // turns submitted EL into the scanner
  //
  startEmbeddedScanner(el, mycallback = null) {
    if (this.app.BROWSER == 0) {
      return;
    }
    if (typeof document === 'undefined') {
      return;
    }
    if (document.querySelector('.qrscanner-container')) {
      return;
    }

    if (mycallback != null) {
      this.scanner_callback = mycallback;
    }

    el.innerHTML = this.returnScannerHTML();
    document.querySelector('.close-scanner').onclick = () => {
      reloadWindow(300);
    };

    let scanner_self = this;

    scanner_self.start(document.getElementById('qr-video'), document.getElementById('qr-canvas'));
  }

  returnScannerHTML() {
    return `
      <div class="qrscanner-container">
        <div id="qr-target" class="qr-target">
          <div class="corners"></div>
          <div id="scanline" class="scanline"></div>
        </div>
        <div id="close-scanner" class="close-scanner"><i class="fa-solid fa-xmark"></i></div>
        <div class="qr-video-container">
          <video playsinline autoplay id="qr-video" class="qr-video"></video>
        </div>
        <canvas style="display: none" id="qr-canvas"></canvas>
      </div>

    `;
  }

  async start(video, canvas) {
    const scanSession = ++this.scan_session;
    this.video = video;
    this.canvas = canvas;

    try {
      this.canvas_context = this.canvas.getContext('2d');
      this.decoder = new Worker('/qrscanner/quirc_worker.js');
      this.decoder.onmessage = (msg) => {
        if (scanSession === this.scan_session) {
          this.onDecoderMessage(msg, scanSession);
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(this.constraints);
      if (scanSession !== this.scan_session) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.handleSuccess(stream);
    } catch (err) {
      if (scanSession === this.scan_session) {
        this.handleError(err);
      }
      return;
    }

    this.startQRDecoderInitializationLoop(scanSession);
  }

  stop() {
    this.scan_session++;
    if (this.decoder_timeout) {
      clearTimeout(this.decoder_timeout);
      this.decoder_timeout = null;
    }
    this.decoder?.terminate();
    this.decoder = null;
    if (this.video?.srcObject) {
      this.video.srcObject.getTracks().forEach((track) => track.stop());
    }
    this.isStreamInit = false;
    this.scanner_callback = null;
    if (typeof document !== 'undefined' && document.querySelector('.qrscanner-container')) {
      document.querySelector('.qrscanner-container').remove();
    }
  }

  render() {}

  //
  // main loop sending messages to quirc_worker to detect qrcodes on the page
  //
  attemptQRDecode() {
    if (this.isStreamInit) {
      try {
        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;
        this.canvas_context.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
        if (this.canvas.width == 0) return;

        var imgData = this.canvas_context.getImageData(0, 0, this.canvas.width, this.canvas.height);

        if (imgData.data) {
          this.decoder.postMessage(imgData);
        }
        return 1;
      } catch (err) {
        return 0;
      }
    } else {
      return 0;
    }
    return 0;
  }

  //
  // worker passes back a message either containing decoded data,
  // or it attempts t
  //
  onDecoderMessage(msg, scanSession = this.scan_session) {
    if (scanSession !== this.scan_session) {
      return;
    }

    if (msg.data != 'done') {
      var qrid = msg.data['payload_string'];
      let right_now = Date.now();
      if (
        qrid != this.last_scanned_raw ||
        this.last_scanned_at < right_now - this.debounce_timeout
      ) {
        this.last_scanned_raw = qrid;
        this.last_scanned_at = right_now;
        this.handleDecodedMessage(qrid);
        return;
      } else if (qrid === this.last_scanned_raw) {
        this.last_scanned_at = right_now;
      }
    }
    this.decoder_timeout = setTimeout(() => {
      this.decoder_timeout = null;
      if (scanSession === this.scan_session) {
        this.attemptQRDecode();
      }
    }, 0);
  }

  //
  // The default behavior of just a publickey is to created initiate a keyexchange.
  // Else, the message is broadcast for other modules to utilize
  //
  handleDecodedMessage(msg) {
    //
    // remove scanline
    //
    if (document.querySelector('.scanline')) {
      document.querySelector('.scanline').remove();
    }

    //
    // we know what we want to do (callback provided)
    //
    if (this.scanner_callback != null) {
      const callback = this.scanner_callback;
      this.stop();
      callback(msg);
      return;
    }

    const decodedValue = typeof msg === 'string' ? msg.trim() : msg;

    //
    // or this is a URL
    //
    if (this.app.browser.isValidUrl(decodedValue)) {
      this.stop();
      let c = confirm('Visit: ' + decodedValue + '?');
      if (c) {
        navigateWindow(decodedValue);
        return;
      }
    }

    //
    // or this is a publickey
    //
    if (this.app.crypto.isPublicKey(decodedValue)) {
      this.stop();
      this.openUserMenu(decodedValue);
      return;
    }

    //
    // non-SAITO publickey?
    //
    if (typeof decodedValue === 'string' && !decodedValue.match(/\s/gi)) {
      if (decodedValue.match(/[0-9a-zA-Z]+/i)) {
        this.stop();

        let obj = {};
        obj.address = decodedValue;
        this.app.connection.emit('saito-crypto-withdraw-render-request', obj);

        return;
      }
    }

    this.sendEvent('qrcode', msg);
  }

  openUserMenu(publicKey) {
    const userMenu = new UserMenu(this.app, publicKey);
    void userMenu.render();
  }

  decodeFromFile(f) {
    var reader = new FileReader();
    reader.onload = ((file) => {
      return (e) => {
        this.canvas_context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        // port to new quirc system
      };
    })(f);
    reader.readAsDataURL(f);
  }

  handleSuccess(stream) {
    window.stream = stream;
    this.video.srcObject = stream;
    this.isStreamInit = true;
  }

  handleError(error) {
    console.error('QRScanner: unable to start camera', error);
    this.stop();
    if (typeof siteMessage === 'function') {
      siteMessage("Unable to access the camera. Check this site's camera permission.", 4000);
    }
  }
}

module.exports = QRScanner;
