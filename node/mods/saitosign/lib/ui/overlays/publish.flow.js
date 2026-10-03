function createMethods() {
  return [
    {
      id: 'email',
      title: 'Email',
      description: 'Verify your email address',
      tier: 'free',
      available: true,
      required: true,
      selected: true,
      status: 'pending'
    },
    {
      id: 'mobile',
      title: 'Mobile',
      description: 'Upgrade to Premium to include mobile verification.',
      tier: 'premium',
      available: false,
      required: false,
      selected: false,
      status: 'pending'
    },
    {
      id: 'photo',
      title: 'Photo',
      description: 'Take a photograph with your camera. You can review it before it is saved with your verification.',
      tier: 'free',
      available: true,
      required: false,
      selected: false,
      status: 'pending'
    },
    {
      id: 'thirdParty',
      title: 'Third-Party',
      description: 'Upgrade to Premium to include third-party identity verification.',
      tier: 'premium',
      available: false,
      required: false,
      selected: false,
      status: 'pending'
    }
  ];
}

function defaultOptions() {
  return {
    email: false,
    phone: false,
    photo: false,
    passport: false,
    legal_review: false,
    online_signing: false,
    archive_contract: false
  };
}

function initialState() {
  return {
    step: 'select',
    plan: 'free',
    options: defaultOptions(),
    signers: [],
    you: null,
    identified: false,
    places: 0,
    verificationMethods: createMethods(),
    signed: false,
    actionStatus: null,
    upsell: null,
    focus: 'email',
    checking: false,
    verifyError: '',
    devCode: '',
    pendingCode: '',
    history: []
  };
}

function go(state, step, patch = {}) {
  return {
    ...state,
    ...patch,
    history: state.history.concat(state.step),
    step
  };
}

function back(state) {
  if (!state.history.length) {
    return state;
  }
  const history = state.history.slice();
  const step = history.pop();
  return { ...state, history, step };
}

function selectPlan(state, plan) {
  if (plan !== 'free' && plan !== 'premium') {
    return state;
  }
  return { ...state, plan };
}

function setShareOption(state, key, checked) {
  if (!state.options || !Object.prototype.hasOwnProperty.call(state.options, key)) {
    return state;
  }
  return {
    ...state,
    options: { ...state.options, [key]: checked === true }
  };
}

function applyShareMetadata(state, metadata) {
  const options = defaultOptions();
  const plan = metadata?.tier === 'premium' ? 'premium' : 'free';
  if (plan === 'premium') {
    const verification = metadata.verification || {};
    options.email = verification.email === true;
    options.phone = verification.phone === true;
    options.photo = verification.photo === true;
    options.passport = verification.passport === true;
    options.legal_review = verification.legal_review === true;
    options.online_signing = metadata.online_signing === true;
    options.archive_contract = metadata.archive_contract === true;
  }
  return { ...state, plan, options };
}

function confirmYou(state, you) {
  const signers = state.signers.map((signer) => {
    if (signer.index !== you.index) {
      return signer;
    }
    return { ...signer, email: you.email, publicKey: you.publicKey, identicon: you.identicon };
  });
  return {
    ...state,
    signers,
    you,
    identified: true
  };
}

function focusMethod(state, id) {
  const method = state.verificationMethods.find((item) => item.id === id);
  if (!method) {
    return state;
  }
  if (method.available) {
    return { ...state, upsell: null, focus: method.id };
  }
  return { ...state, upsell: id };
}

function toggleMethod(state, id, selected) {
  const verificationMethods = state.verificationMethods.map((method) => {
    if (method.id !== id || !method.available) {
      return method;
    }
    return { ...method, selected };
  });
  return { ...state, verificationMethods };
}

function markMethodSent(state, id) {
  const verificationMethods = state.verificationMethods.map((method) => {
    if (method.id !== id) {
      return method;
    }
    return { ...method, status: 'sent', selected: true };
  });
  return { ...state, verificationMethods };
}

function markMethodVerified(state, id) {
  const verificationMethods = state.verificationMethods.map((method) => {
    if (method.id !== id) {
      return method;
    }
    return { ...method, status: 'verified', selected: true };
  });
  return { ...state, verificationMethods };
}

function currentMethod(state) {
  return state.verificationMethods.find((method) => method.selected && method.status !== 'verified') || null;
}

function requiredComplete(state) {
  return state.verificationMethods
    .filter((method) => method.required)
    .every((method) => method.status === 'verified');
}

function advance(state) {
  switch (state.step) {
    case 'select':
      return go(state, 'sign');
    case 'sign':
      if (!state.identified || !state.you) {
        return state;
      }
      return go(state, 'verify');
    case 'premium':
      return go(state, 'sign', { plan: 'free' });
    default:
      return state;
  }
}

function learnPremium(state) {
  if (state.step === 'premium') {
    return state;
  }
  return go(state, 'premium');
}

function shareRows(state) {
  const list = state.signers.slice();
  if (state.you && !list.some((signer) => signer.index === state.you.index)) {
    list.unshift(state.you);
  }
  return list.map((signer) => {
    const you = state.you && signer.index === state.you.index;
    const signed = signer.signed === true || (you && state.signed === true);
    return {
      name: signer.name || signer.email || 'Signer',
      signed
    };
  });
}

module.exports = {
  initialState,
  back,
  selectPlan,
  setShareOption,
  applyShareMetadata,
  confirmYou,
  focusMethod,
  toggleMethod,
  markMethodSent,
  markMethodVerified,
  currentMethod,
  requiredComplete,
  go,
  advance,
  learnPremium,
  shareRows
};
