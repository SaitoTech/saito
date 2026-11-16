const assert = require('node:assert/strict');
const test = require('node:test');

const TestimonialsTemplate = require('../../../mods/popup/lib/testimonials.template');

const expected = [
  ["I love your site; in fact I'm addicted to it", 'D. Andrews, entrepreneur'],
  ['such an absolute pleasure', 'R.J., student'],
  ["the cat's meow", 'David Moser, Academic Director CET'],
  ['the best service I have found', 'http://sinocism.com'],
  ["better 'attitude' to Chinese studies", 'East Asia Student'],
  ['Nobel Prize for language learning', 'J.N., sinophile'],
  ['Popup Chinese is a godsend', 'E. Shea, student'],
  ['consistently full of win', "Mark's China Blog"],
  ['99% of them are pure junk', 'C.X., Chinese parent'],
  ['where they say "pingr"', 'E.H., engineer'],
  ['delay death each day', 'Anonymous'],
  ['recite some episodes by heart', 'user na.1788'],
  ['loaded with kouyuhua', 'PekingDuck.org'],
  ['10 months I spent "learning mandarin"', 'user the.koko'],
  ["I can't say enough good things about your site. :)", 'Yanni (雅匿)'],
  ['one year scholarship to China', 'Anna V.'],
  ['太监 anyone?', 'Joshua']
];

test('the testimonials page keeps every original quotation and attribution', () => {
  const html = TestimonialsTemplate();
  assert.match(html, /What People Say About Popup Chinese/);
  assert.equal(html.match(/class="popup-testimonial"/g).length, expected.length);
  for (const [quote, author] of expected) {
    assert.ok(html.includes(quote), quote);
    assert.ok(html.includes(author), author);
  }
});
