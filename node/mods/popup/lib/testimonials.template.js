const testimonials = [
  {
    quote:
      "I love your site; in fact I'm addicted to it.... I started learning Mandarin with Rosetta Stone, but find Popup Chinese so much more relevant.",
    author: 'D. Andrews, entrepreneur'
  },
  {
    quote:
      'I am finding Popup Chinese such an absolute pleasure that I am torn between enrolling in 7th and 8th semester Chinese classes or continuing my Chinese studies solely with your site.',
    author: 'R.J., student'
  },
  {
    quote: "Popup Chinese is the cat's meow....",
    author: 'David Moser, Academic Director CET'
  },
  {
    quote: 'If you want to learn Chinese online Popup Chinese is the best service I have found.',
    author: 'Bill Bishop, <a href="http://sinocism.com">Sinocism.com</a>'
  },
  {
    quote:
      "Popup Chinese strikes me as having a better 'attitude' to Chinese studies, and offers a bit more depth than other providers.",
    author: 'East Asia Student'
  },
  {
    quote:
      "I absolutely love, love, love your site/company. What you all have done with learning Chinese is absolutely wonderful, and deserves some type of Nobel Prize for language learning! &nbsp;You have no idea how many years of boring textbooks I've been through, or maybe you do and that's why you've started this :-)",
    author: 'J.N., sinophile'
  },
  {
    quote: 'Popup Chinese is a godsend',
    author: 'E. Shea, student'
  },
  {
    quote:
      'The lessons are consistently full of win.... Both the dialogues and the explanations are entertaining and the language in them is very useful. So basically the opposite of using the conventional textbooks that have guided my first couple of years of studying Chinese.',
    author: "Mark's China Blog"
  },
  {
    quote:
      'There are so many Chinese teaching websites out there, but 99% of them are pure junk, or actually harmful for learning Chinese. &nbsp;I really hope good content like yours will pop out and last. &nbsp;If there is anything I can do to help, please let me know.',
    author: 'C.X., Chinese parent'
  },
  {
    quote:
      'I was amazed on my last trip to China, because I went to Taiyuan, where they say "pingr". I heard it first on Popup Chinese! The conversations on the site at first sounded slurred, but now I notice that that is the way people speak. I listen to my older teaching materials and they are slow and too perfect.',
    author: 'E.H., engineer'
  },
  {
    quote:
      "I've lived for 30 years and Popup Chinese is one of the few amusements that convinces me to delay death each day.",
    author: 'Anonymous'
  },
  {
    quote:
      "I've learned more Chinese, learned faster, and had way more fun learning than I ever thought possible.... I listen so much so often that I can recite some episodes by heart and mimic the voice actor/actress by now (I'm still at the Elementary but these days I can somewhat follow along TV shows and radio, which before only sounded like an incomprehensible jumble of sound).",
    author: 'user na.1788'
  },
  {
    quote:
      "I'm really enjoying Popup Chinese... the authentic sound and pace of the dialogues - even the elementary lessons are spoken at the actual speed you'll hear people speak here, and loaded with kouyuhua.",
    author: 'Richard, PekingDuck.org'
  },
  {
    quote:
      'I\'ve learned more Chinese in this one month spent on this site than the 10 months I spent "learning mandarin" in Shanghai 5 years back.',
    author: 'user the.koko'
  },
  {
    quote:
      "Your site is wonderful! I find your dialogs to be practical, inventive, and interesting. Furthermore, they present natural language, and are well-structured for teaching, with impressive execution (i.e. various voices, and necessary repetition for early learners). I can't say enough good things about your site. :)",
    author: 'Yanni (雅匿)'
  },
  {
    quote:
      "I'm writing to thank you for the one year scholarship to China that I've just received from the Confucius Institute. I'm a self-learner and have been studying with Popup Chinese as the main curriculum for about a year and a half. When I passed the HSK (level 3) or speak Chinese or write or read (or do anything with the Chinese language), my friends and family are always impressed, and especially by the fact that I don't go to any class and spent almost nothing learning Chinese.",
    author: 'Anna V.'
  },
  {
    quote:
      "I've listened to your podcasts way too much the past four months, and I've gone from not even understanding the absolute beginners to being able to keep up in the intermediate level podcasts.  I am now living with a Chinese roommate at an American university, and get to practice Chinese with my neighbors often. They are all impressed with the speed at which I learned, with my pronunciation, and with my decent (and sometimes strange, 太监 anyone?) vocabulary.   I can't tell you how many times they are impressed when I correctly use a difficult word, phrase, or colloquialism.<p></p>I have learned almost exclusively from Popup and Anki flashcards.  I took no formal Chinese courses and until today, I had paid no money.  But I'm subscribing today not because I need the extra features but because I am very grateful for your service.  Sometimes my Chinese friends laugh at the strange podcasts, then they give it a listen, then they are envious and want a Popup English to help them learn English. :D",
    author: 'Joshua'
  }
];

module.exports = () => {
  const cards = testimonials
    .map(
      (item) => `
        <article class="popup-testimonial">
          <blockquote>${item.quote}</blockquote>
          <footer>-- ${item.author}</footer>
        </article>
      `
    )
    .join('');

  return `
    <div class="popup-testimonials-page">
      <div class="popup-home-wrap">
        <header class="popup-testimonials-intro">
          <h1>What People Say About Popup Chinese</h1>
        </header>
        <div class="popup-testimonials-list">
          ${cards}
        </div>
      </div>
    </div>
  `;
};
