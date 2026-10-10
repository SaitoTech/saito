function defaultOptions() {
  return {
    email: true,
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
    tierOwner: '',
    canChooseTier: true,
    options: defaultOptions(),
    signers: [],
    candidateIndex: null,
    you: null,
    identified: false,
    places: 0,
    verificationMethods: createMethods(defaultOptions()),
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
  if (state.canChooseTier === false) {
    return state;
  }
  if (plan !== 'free' && plan !== 'premium') {
    return state;
  }
  return { ...state, plan };
}

function setShareOption(state, key, checked) {
  if (state.canChooseTier === false) {
    return state;
  }
  if (!state.options || !Object.prototype.hasOwnProperty.call(state.options, key)) {
    return state;
  }
  return updateRequirements(state, { [key]: checked === true });
}

function applyShareMetadata(state, metadata) {
  const options = defaultOptions();
  const plan = metadata?.tier === 'premium' ? 'premium' : 'free';
  const verification = metadata?.verification || {};
  options.email = verification.email !== false;
  options.phone = plan === 'premium' && verification.phone === true;
  options.photo = verification.photo === true;
  options.passport = plan === 'premium' && verification.passport === true;
  options.legal_review = plan === 'premium' && verification.legal_review === true;
  options.online_signing = plan === 'premium' && metadata?.online_signing === true;
  options.archive_contract = plan === 'premium' && metadata?.archive_contract === true;
  const verificationMethods = createMethods(options);
  return {
    ...state,
    plan,
    options,
    verificationMethods,
    focus: verificationMethods.some((method) => method.id === state.focus) ? state.focus : verificationMethods[0]?.id || 'email',
    tierOwner: String(metadata?.tier_owner || '').trim()
  };
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
    candidateIndex: null,
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

function updateRequirements(state, options) {
  const nextOptions = { ...state.options, ...options };
  const verificationMethods = createMethods(nextOptions);
  return {
    ...state,
    options: nextOptions,
    verificationMethods,
    focus: verificationMethods.some((method) => method.id === state.focus) ? state.focus : verificationMethods[0]?.id || 'email'
  };
}

function createMethods(options = {}) {
  const definitions = [
    { id: 'email', key: 'email', title: 'Email', description: 'Verify your email address' },
    { id: 'mobile', key: 'phone', title: 'Mobile', description: 'Verify your mobile number' },
    { id: 'photo', key: 'photo', title: 'Photo', description: 'Take a photograph with your camera. You can review it before it is saved with your verification.' },
    { id: 'passport', key: 'passport', title: 'Passport', description: 'Upload the photo and identity page of your passport.' },
    { id: 'thirdParty', key: 'legal_review', title: 'Legal review', description: 'Third-party identity review' }
  ];
  return definitions.filter((method) => options[method.key] === true).map((method) => ({
    id: method.id,
    title: method.title,
    description: method.description,
    tier: method.key === 'email' || method.key === 'photo' ? 'free' : 'premium',
    available: true,
    required: true,
    selected: true,
    status: 'pending'
  }));
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

const workflowStages = ['select', 'identity', 'sign', 'verify', 'share'];

function firstRequiredAction(requirements) {
  if (requirements.newDocument) {
    return 'select';
  }
  if (!requirements.identified) {
    return 'identity';
  }
  if (requirements.outstandingSignatures) {
    return 'sign';
  }
  if (!requirements.verificationComplete) {
    return 'verify';
  }
  return 'share';
}

function resolveInitial(state, requirements) {
  const step = firstRequiredAction(requirements);
  return {
    ...state,
    step,
    history: workflowStages.slice(0, workflowStages.indexOf(step))
  };
}

function resolveAfter(state, completedStage, requirements) {
  const completedIndex = workflowStages.indexOf(completedStage);
  if (completedIndex < 0) {
    return state;
  }
  const later = workflowStages.slice(completedIndex + 1);
  let step = 'share';
  for (const candidate of later) {
    if (candidate === 'identity' && !requirements.identified) {
      step = candidate;
      break;
    }
    if (candidate === 'sign' && requirements.identified && requirements.outstandingSignatures) {
      step = candidate;
      break;
    }
    if (candidate === 'verify' && requirements.identified && !requirements.verificationComplete) {
      step = candidate;
      break;
    }
  }
  return {
    ...state,
    step,
    history: workflowStages.slice(0, workflowStages.indexOf(step))
  };
}

function advance(state) {
  if (state.step === 'select') {
    return go(state, 'share');
  }
  if (state.step === 'premium') {
    return go(state, 'sign', { plan: 'free' });
  }
  return state;
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
  updateRequirements,
  markMethodSent,
  markMethodVerified,
  currentMethod,
  requiredComplete,
  firstRequiredAction,
  resolveInitial,
  resolveAfter,
  go,
  advance,
  learnPremium,
  shareRows
};
