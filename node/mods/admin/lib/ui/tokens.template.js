const KEYS = [
  {
    private: 'd62cd978a0bac0bcf97eff82f7388c6210f649e2126c332dcee3894cfd77a103',
    public: 'wDwNGzgx1yn2N21gHiHs43USRiXPx9H9NAcef1UZjLRX'
  },
  {
    private: '0435658a9dd54ce741b4ce4789711707e8cf4aa7e841a76ff5df0313caf941d1',
    public: 'sHs6UQb5TDN5WTJ4nnehSUo79uCMxZaCENrzPzGiV6pJ'
  },
  {
    private: 'c8beb43281c53efea632d3a6185577b446ab1403b4b67525f8e8aef4f7513ba6',
    public: 'h17F8nAJ6BEsFuUbD4EbQKwHHYQBZxzwQpAsL58akY7m'
  },
  {
    private: '7614198ed41f4214729a7d5957c2e79d969792d3046bfd43348b8bed5567f582',
    public: 'xM2vUs5XCpNjYjcgxk4yVhybDcayk3tnwZNWrFg7jRGs'
  },
  {
    private: '45dd08cfa770778c5dcaa9d6c0e63815f16dda79c43cf6aaadbbcae017a8bd5d',
    public: 'tFCXYDgmKxTZTKG1wDuLLkLW1T1tZ5uiz4fZDPeYGWfC'
  },
  {
    private: 'ce17f5286520182283876638ffc36bc8a0db3e2498dddcc30587cfa94eb4b50d',
    public: 'zavTygq2xGHETckJvnMNfgY5UpqWEU46vBXyVz2wUZgz'
  },
  {
    private: '7462b66d116779aafd485d86fce0e7c86e7396e0fb8b6b995bba0a9578ba9466',
    public: 'dd4s6mdnYdq4bb7QtcwTRWoq7hApUiQrDGi9CE8hvfdc'
  },
  {
    private: 'f2a7da8b170894bac3152957c6b45a0b5af823cef9224df5cb66807042ec8917',
    public: 'bujP18K4fkzHvtuRriXqgN6ay8AmUjhoRSj9jjBXohkj'
  },
  {
    private: '503ed5ff51f2a17866ce8ca34013e58bb697a4aae740c40e6d1c1d3cf0d528a0',
    public: 'muJ8J1paK3nvHdFtdpakTejgCsAVkFmG7rGkc2dvCNpm'
  },
  {
    private: '5e8baa6faf568242ab7bce2cbdaa7684d50de778f2e873f2423cd0d3c955fbed',
    public: 'urxxJT3p3wBNM1FSpF8nCUd8mKbyqGARbgDybr43Umna'
  }
];

module.exports = () => {
  const pairs = KEYS.map(
    (key) => `
      <div class="admin-key-pair">
        <div class="admin-key-line">
          <span class="admin-key-label">Public Key</span>
          <code class="admin-key-value">${key.public}</code>
        </div>
        <div class="admin-key-line admin-key-private-line">
          <span class="admin-key-label">Private Key</span>
          <code class="admin-key-value">${key.private}</code>
          <button type="button" class="admin-copy-cmd" data-cmd="${key.private}"
            title="Copy private key" aria-label="Copy private key">
            <i class="fa-solid fa-copy" aria-hidden="true"></i>
          </button>
        </div>
      </div>`
  ).join('');

  return `
    <div class="admin-keys-panel">
      <h2>Local Development Keys</h2>
      <p class="admin-keys-note">
        These private keys have tokens available by default. You can import them into browser wallets
        using the import private key function. Please only use these keys for local development, as
        they are publicly shared. Do not use them on public networks.
      </p>
      <div class="admin-keys-list">
        ${pairs}
      </div>
    </div>
  `;
};
