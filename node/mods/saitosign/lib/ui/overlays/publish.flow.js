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
      description: 'Upgrade to Premium to include photo or video verification.',
      tier: 'premium',
      available: false,
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

function initialState() {
  return {
    step: 'select',
    plan: 'free',
    signers: [],
    you: null,
    identified: false,
    places: 0,
    verificationMethods: createMethods(),
    signed: false,
    actionStatus: null,
    upsell: null,
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
  if (!method || method.available) {
    return { ...state, upsell: null };
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
      if (!state.identified) {
        return state;
      }
      return go(state, 'sign');
    case 'sign':
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
  const lines = state.verificationMethods
    .filter((method) => method.status === 'verified')
    .map((method) => {
      if (method.id === 'email') {
        return 'email verified';
      }
      if (method.id === 'thirdParty') {
        return 'Third-party identity verified';
      }
      return `${method.title} verified`;
    });
  const list = state.signers.slice();
  if (state.you && !list.some((signer) => signer.index === state.you.index)) {
    list.unshift(state.you);
  }
  return list.map((signer) => {
    const you = state.you && signer.index === state.you.index;
    const name = signer.name || signer.email || 'Signer';
    if (you && state.signed) {
      return { name, detail: '', done: true, lines };
    }
    return { name, detail: 'Awaiting verification', done: false, lines: [] };
  });
}

module.exports = {
  initialState,
  back,
  selectPlan,
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
