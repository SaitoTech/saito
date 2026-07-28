function requestParams(txmsg) {
  if (txmsg?.data && typeof txmsg.data === 'object' && !Array.isArray(txmsg.data)) {
    return txmsg.data;
  }
  return txmsg || {};
}

function success(data) {
  return { success: true, data };
}

function failure(error) {
  return { success: false, error };
}

module.exports = {
  requestParams,
  success,
  failure
};
