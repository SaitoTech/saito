// Pinned Hugging Face ONNX q8 models. JSON hashes computed from these revisions;
// weight hashes and sizes match the upstream Git LFS metadata.
export const MODELS = [
  {
    id: 'Xenova/whisper-tiny.en',
    revision: '79fb389fc764e7c395bd330e9531d9d32ada7049',
    label: 'Whisper Tiny \u2014 English',
    multilingual: false,
    files: [
      {
        path: 'config.json',
        bytes: 2202,
        sha256: '37a1073be00d19118c06557896c7c148598f4d8277edc0f5bc07c9f5554839f1'
      },
      {
        path: 'generation_config.json',
        bytes: 1590,
        sha256: '132c95ba9db45f4498f2eab3fea7c1d6a174005010f8f6b7d20cfd5e9795996b'
      },
      {
        path: 'preprocessor_config.json',
        bytes: 339,
        sha256: 'a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d'
      },
      {
        path: 'tokenizer.json',
        bytes: 2128494,
        sha256: 'c6ee8f089220a5b1188f6426456772572671c6141ae007eecb83c6a8349f5deb'
      },
      {
        path: 'tokenizer_config.json',
        bytes: 835,
        sha256: 'e082c1ad251541bf277967a703252cddd4bb37a71a43737e03d050c22ec08238'
      },
      {
        path: 'onnx/encoder_model_quantized.onnx',
        bytes: 10124913,
        sha256: '8cc3c6f8563d1b3fbd2c5af9f64c2bed8b020bc593c402d1ef53b9f08fbf1b90'
      },
      {
        path: 'onnx/decoder_model_merged_quantized.onnx',
        bytes: 30727382,
        sha256: 'dbb2e063b7fbc41d9803b9698f93ecb035c50cbb3fb87b56cb131e4a5eb99059'
      }
    ]
  },
  {
    id: 'Xenova/whisper-tiny',
    revision: '5332fcc35e32a33b86612b9a57a89be7906102b1',
    label: 'Whisper Tiny \u2014 Multilingual',
    multilingual: true,
    files: [
      {
        path: 'config.json',
        bytes: 2248,
        sha256: '2b2e4e519084e0ea028b19b153f95202735a971870d6844aa26e559edd292e94'
      },
      {
        path: 'generation_config.json',
        bytes: 3716,
        sha256: '68ac791fcb4999461a313472125042934656240ba1cba7d1c2627fcbb19ac24c'
      },
      {
        path: 'preprocessor_config.json',
        bytes: 339,
        sha256: 'a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d'
      },
      {
        path: 'tokenizer.json',
        bytes: 2480466,
        sha256: '27fc476bfe7f17299480be2273fc0608e4d5a99aba2ab5dec5374b4482d1a566'
      },
      {
        path: 'tokenizer_config.json',
        bytes: 282683,
        sha256: '2a4c4281cf9f51ac6ccc406fdc711a087afe6530f671fa7b80953edc498275ce'
      },
      {
        path: 'onnx/encoder_model_quantized.onnx',
        bytes: 10124910,
        sha256: 'fd9d995b9dcb0520f0dbf6cf68651af639fc385f594d9d876e69ca2802dc438e'
      },
      {
        path: 'onnx/decoder_model_merged_quantized.onnx',
        bytes: 30727765,
        sha256: '6c0c125986b007d2e3734bec84c18bda0152071b90b87fadac6d7764499927a0'
      }
    ]
  },
  {
    id: 'Xenova/whisper-base.en',
    revision: '95bf40a508535962c6483ead40270b2e32267508',
    label: 'Whisper Base \u2014 English',
    multilingual: false,
    files: [
      {
        path: 'config.json',
        bytes: 2202,
        sha256: '5c390f2c6ba84ddeb7e362cd8b2123832911407850174e64d7081ccc36df2d64'
      },
      {
        path: 'generation_config.json',
        bytes: 1500,
        sha256: '1e57ed56ad1bd7f08a49ece7fe7daada674573805a35f8bdbbe68380aab5b1ee'
      },
      {
        path: 'preprocessor_config.json',
        bytes: 339,
        sha256: 'a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d'
      },
      {
        path: 'tokenizer.json',
        bytes: 2128494,
        sha256: 'c6ee8f089220a5b1188f6426456772572671c6141ae007eecb83c6a8349f5deb'
      },
      {
        path: 'tokenizer_config.json',
        bytes: 835,
        sha256: 'e082c1ad251541bf277967a703252cddd4bb37a71a43737e03d050c22ec08238'
      },
      {
        path: 'onnx/encoder_model_quantized.onnx',
        bytes: 23200856,
        sha256: 'd0d4e59e2842617b39787cece73d7e8f76f99b1697d3386c0e682eca2269f4a1'
      },
      {
        path: 'onnx/decoder_model_merged_quantized.onnx',
        bytes: 53707027,
        sha256: 'a25afc5858a20aabb7652cb2d555996ebe10691a69bbdb423d5073d52f060325'
      }
    ]
  },
  {
    id: 'Xenova/whisper-base',
    revision: '64da57285918e20ea79ea5c88eed7197933abaa8',
    label: 'Whisper Base \u2014 Multilingual',
    multilingual: true,
    files: [
      {
        path: 'config.json',
        bytes: 2248,
        sha256: 'd1d347fdb422e6347c2f843a90d375aa67ea3f4b3e20d2c3075f9a9f6243685b'
      },
      {
        path: 'generation_config.json',
        bytes: 3776,
        sha256: '3bba359e33fdd6dc1c10f71846a477d339b0242f462f70ea1dd73274caa38d05'
      },
      {
        path: 'preprocessor_config.json',
        bytes: 339,
        sha256: 'a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d'
      },
      {
        path: 'tokenizer.json',
        bytes: 2480466,
        sha256: '27fc476bfe7f17299480be2273fc0608e4d5a99aba2ab5dec5374b4482d1a566'
      },
      {
        path: 'tokenizer_config.json',
        bytes: 282683,
        sha256: '2a4c4281cf9f51ac6ccc406fdc711a087afe6530f671fa7b80953edc498275ce'
      },
      {
        path: 'onnx/encoder_model_quantized.onnx',
        bytes: 23200850,
        sha256: '3e345e977b55620a37c0c2b2af0644e019afdfad562dcf71eb929bb7274285f9'
      },
      {
        path: 'onnx/decoder_model_merged_quantized.onnx',
        bytes: 53707539,
        sha256: 'a6beb6baabb66f00b6a686d828c95ffca6146d51900cbad0266cad38f64cf861'
      }
    ]
  }
];

export const LANGUAGES = [
  'af',
  'am',
  'ar',
  'as',
  'az',
  'ba',
  'be',
  'bg',
  'bn',
  'bo',
  'br',
  'bs',
  'ca',
  'cs',
  'cy',
  'da',
  'de',
  'el',
  'en',
  'es',
  'et',
  'eu',
  'fa',
  'fi',
  'fo',
  'fr',
  'gl',
  'gu',
  'ha',
  'haw',
  'he',
  'hi',
  'hr',
  'ht',
  'hu',
  'hy',
  'id',
  'is',
  'it',
  'ja',
  'jw',
  'ka',
  'kk',
  'km',
  'kn',
  'ko',
  'la',
  'lb',
  'ln',
  'lo',
  'lt',
  'lv',
  'mg',
  'mi',
  'mk',
  'ml',
  'mn',
  'mr',
  'ms',
  'mt',
  'my',
  'ne',
  'nl',
  'nn',
  'no',
  'oc',
  'pa',
  'pl',
  'ps',
  'pt',
  'ro',
  'ru',
  'sa',
  'sd',
  'si',
  'sk',
  'sl',
  'sn',
  'so',
  'sq',
  'sr',
  'su',
  'sv',
  'sw',
  'ta',
  'te',
  'tg',
  'th',
  'tk',
  'tl',
  'tr',
  'tt',
  'uk',
  'ur',
  'uz',
  'vi',
  'yi',
  'yo',
  'zh'
];
