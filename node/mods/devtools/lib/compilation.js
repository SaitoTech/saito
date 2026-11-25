const COMPILATION_DISABLED_MESSAGE =
  'Server-side Saito application compilation is not enabled on this server. If you would like to develop and compile Saito applications, please visit our staging server at staging.saito.io.';

const COMPILATION_UNAVAILABLE_MESSAGE =
  'Saito application compilation is unavailable because this server did not report its compilation status.';

const STAGING_URL = 'https://staging.saito.io';

const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,64}$/i;

function isCompilationEnabled(options) {
  return options?.devtools?.compilation_enabled === true;
}

function isAllowedModuleSlug(slug) {
  return typeof slug === 'string' && SLUG_PATTERN.test(slug);
}

function compilationDisabledHtml() {
  return (
    'Server-side Saito application compilation is not enabled on this server. ' +
    'If you would like to develop and compile Saito applications, please visit our staging server at ' +
    `<a href="${STAGING_URL}" target="_blank" rel="noopener noreferrer">staging.saito.io</a>.`
  );
}

module.exports = {
  COMPILATION_DISABLED_MESSAGE,
  COMPILATION_UNAVAILABLE_MESSAGE,
  STAGING_URL,
  isCompilationEnabled,
  isAllowedModuleSlug,
  compilationDisabledHtml
};
