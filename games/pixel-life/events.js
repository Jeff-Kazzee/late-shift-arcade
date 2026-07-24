// The life-event table. Everything Pixel Life can do to you lives here;
// adding an event is adding an object. Fields:
//   id       unique string
//   age      [min, max] inclusive years the event can fire
//   require  optional { stat: minValue } — all must hold
//   forbid   optional { stat: maxValue } — stat must be BELOW value
//   once     optional true — fires at most once per life
//   weird    0–3, feeds the obituary's "weirdest event" pick
//   effects  { health, smarts, money, happiness } deltas (any subset)
//   text     what the year did to you

export const EVENTS = [
  // --- childhood (0–12) ---------------------------------------------------
  { id: 'born-loud', age: [0, 0], once: true, weird: 0, effects: { happiness: 2 }, text: 'You are born. You handle it badly, but so does everyone.' },
  { id: 'first-word-brand', age: [1, 2], once: true, weird: 1, effects: { smarts: 2 }, text: 'Your first word is a brand of dish soap. Your parents pretend it was "mama".' },
  { id: 'ate-crayon', age: [2, 5], weird: 1, effects: { health: -2, happiness: 3 }, text: 'You eat a crayon. Burnt sienna. No regrets.' },
  { id: 'imaginary-friend-job', age: [3, 7], once: true, weird: 2, effects: { happiness: 4 }, text: 'Your imaginary friend gets a job and stops coming around.' },
  { id: 'bike-no-hands', age: [6, 11], effects: { health: -5, happiness: 5 }, text: 'You ride your bike with no hands for four glorious seconds.' },
  { id: 'spelling-bee', age: [7, 11], require: { smarts: 55 }, once: true, effects: { smarts: 4, happiness: 2 }, text: 'You lose the spelling bee on "necessary", which feels unnecessary.' },
  { id: 'lemonade-stand', age: [7, 11], once: true, effects: { money: 2, smarts: 2 }, text: 'Your lemonade stand clears a profit of $4. You learn nothing about overhead because your parents were the overhead.' },
  { id: 'goldfish-funeral', age: [4, 10], once: true, weird: 1, effects: { happiness: -3, smarts: 1 }, text: 'Your goldfish dies. The funeral is brief but dignified.' },
  { id: 'school-play-tree', age: [5, 10], once: true, weird: 1, effects: { happiness: 3 }, text: 'You are cast as "Tree #2" in the school play. Critics call you wooden.' },
  { id: 'found-arrowhead', age: [6, 12], once: true, weird: 2, effects: { smarts: 3, happiness: 3 }, text: 'You find what is either an arrowhead or gravel. You choose to believe.' },
  { id: 'chickenpox', age: [3, 9], once: true, effects: { health: -6, happiness: -2 }, text: 'Chickenpox. You are briefly a connect-the-dots puzzle.' },
  { id: 'skipped-grade', age: [6, 11], require: { smarts: 70 }, once: true, effects: { smarts: 5, happiness: -3 }, text: 'You skip a grade. Your new classmates are enormous and unimpressed.' },

  // --- teens (13–19) --------------------------------------------------------
  { id: 'garage-band', age: [13, 18], once: true, weird: 1, effects: { happiness: 6, money: -3 }, text: 'You join a garage band called Sofa King. The garage asks you to leave.' },
  { id: 'first-job-fries', age: [15, 19], once: true, effects: { money: 6, happiness: -4 }, text: 'First job: the fryer. You smell like victory, if victory were potatoes.' },
  { id: 'aced-exams', age: [14, 18], require: { smarts: 60 }, effects: { smarts: 5, happiness: 2 }, text: 'You ace your exams. Someone asks if you even studied. You did. Constantly.' },
  { id: 'failed-drivers-test', age: [16, 19], once: true, effects: { happiness: -4, smarts: 2 }, text: 'You fail the driving test on parallel parking, the only skill the test cares about.' },
  { id: 'growth-spurt', age: [13, 16], once: true, effects: { health: 4 }, text: 'Growth spurt. Your pants surrender.' },
  { id: 'prom-disaster', age: [16, 18], once: true, weird: 2, effects: { happiness: -5 }, text: 'At prom, the fog machine malfunctions. You slow-dance with a stranger for one full song.' },
  { id: 'scholarship', age: [17, 19], require: { smarts: 65 }, once: true, effects: { money: 8, smarts: 3, happiness: 4 }, text: 'You win a scholarship named after a man who invented a kind of valve.' },
  { id: 'wisdom-teeth', age: [16, 19], once: true, effects: { health: -3, money: -4 }, text: 'Wisdom teeth out. The video of you afterward is now family currency.' },
  { id: 'debate-club', age: [13, 17], require: { smarts: 55 }, once: true, effects: { smarts: 4, happiness: -2 }, text: 'You join debate club and lose an argument about whether hot dogs are sandwiches. Publicly.' },
  { id: 'summer-romance', age: [15, 19], once: true, effects: { happiness: 7 }, text: 'A summer romance. It ends in September, like all federally regulated romances.' },

  // --- adult (20–64) --------------------------------------------------------
  { id: 'first-apartment', age: [19, 26], once: true, effects: { money: -6, happiness: 5 }, text: 'Your first apartment. The shower has one temperature: surprise.' },
  { id: 'degree', age: [21, 25], require: { smarts: 60 }, once: true, effects: { smarts: 6, money: -8, happiness: 3 }, text: 'You graduate. The gown rental costs more than the diploma frame.' },
  { id: 'office-job', age: [21, 40], require: { smarts: 55 }, effects: { money: 8, happiness: -3 }, text: 'You get an office job. Your calendar becomes a hostile ecosystem.' },
  { id: 'crypto-cousin', age: [20, 60], weird: 2, forbid: { smarts: 75 }, effects: { money: -9 }, text: 'Your cousin has an investment opportunity. It is a picture of a dog. You buy the dog picture.' },
  { id: 'promotion', age: [25, 55], require: { smarts: 60, happiness: 40 }, effects: { money: 10, happiness: 2 }, text: 'Promotion. You now attend the meetings about the meetings.' },
  { id: 'laid-off', age: [24, 60], effects: { money: -8, happiness: -6 }, text: 'The company "restructures". You are the part that used to be structure.' },
  { id: 'marathon', age: [22, 50], require: { health: 65 }, once: true, effects: { health: 6, happiness: 4, money: -2 }, text: 'You run a marathon. Mile 19 shows you who you really are: a person who walks mile 20.' },
  { id: 'wedding', age: [24, 45], require: { happiness: 50 }, once: true, effects: { happiness: 10, money: -10 }, text: 'You get married. The DJ plays the song you specifically banned. It goes off.' },
  { id: 'kid', age: [24, 45], require: { happiness: 45 }, once: true, effects: { happiness: 8, money: -8, health: -3 }, text: 'A baby. Sleep becomes folklore — a thing the elders speak of.' },
  { id: 'novel-drawer', age: [25, 60], require: { smarts: 60 }, once: true, weird: 1, effects: { smarts: 3, happiness: -2 }, text: 'You finish your novel and put it in a drawer, where it will ferment into embarrassment.' },
  { id: 'house', age: [28, 55], require: { money: 60 }, once: true, effects: { money: -15, happiness: 7 }, text: 'You buy a house. You now have opinions about gutters.' },
  { id: 'kitchen-fire', age: [20, 70], weird: 1, effects: { health: -4, money: -3 }, text: 'A small kitchen fire. The smoke alarm performs beyond expectations. So does your neighbor.' },
  { id: 'gym-january', age: [22, 60], effects: { health: 3, money: -2 }, text: 'You join a gym in January. You go eleven times, which is above average.' },
  { id: 'jury-duty', age: [21, 70], once: true, weird: 1, effects: { smarts: 3, happiness: -3 }, text: 'Jury duty. The case is about a fence. It takes nine days.' },
  { id: 'side-hustle', age: [22, 55], require: { smarts: 50 }, effects: { money: 6, health: -2 }, text: 'Your side hustle takes off, in the sense that it now also consumes your Sundays.' },
  { id: 'sourdough', age: [25, 65], once: true, weird: 1, effects: { happiness: 4, smarts: 2 }, text: 'You name your sourdough starter. You tell people about it. They allow this.' },
  { id: 'back-thing', age: [30, 60], once: true, effects: { health: -6, happiness: -2 }, text: 'You develop A Back Thing while picking up nothing at all.' },
  { id: 'inheritance', age: [30, 70], once: true, weird: 1, effects: { money: 12, happiness: -2 }, text: 'A great-aunt leaves you money and a taxidermied owl. The owl is non-negotiable.' },
  { id: 'therapy', age: [22, 70], once: true, effects: { happiness: 8, money: -4 }, text: 'You start therapy and learn that "fine" was doing a lot of unpaid work.' },
  { id: 'promotion-title', age: [30, 60], require: { smarts: 65 }, once: true, weird: 1, effects: { money: 6 }, text: 'New title: Senior Vice Associate Director of Special Initiatives. Nobody, including you, knows what you do.' },
  { id: 'pet-cat', age: [20, 75], once: true, effects: { happiness: 6, money: -2 }, text: 'You adopt a cat. The cat adopts a policy of neutrality.' },
  { id: 'food-poisoning', age: [18, 75], weird: 0, effects: { health: -5, happiness: -3 }, text: 'The gas-station sushi was a bet against the universe. The universe collects.' },
  { id: 'reunion', age: [28, 60], once: true, effects: { happiness: -3, smarts: 2 }, text: 'High-school reunion. Everyone is somehow both older and exactly the same.' },
  { id: 'startup', age: [24, 45], require: { smarts: 60, money: 40 }, once: true, weird: 1, effects: { money: -12, smarts: 5, health: -3 }, text: 'You found a startup. The pitch deck says "the Uber of soup". Investors say other things.' },
  { id: 'startup-exit', age: [26, 50], require: { smarts: 70, money: 30 }, once: true, weird: 2, effects: { money: 20, happiness: 5 }, text: 'Against all documented odds, the soup thing exits. You are briefly interviewed by a podcast.' },
  { id: 'midlife-guitar', age: [38, 55], once: true, weird: 1, effects: { happiness: 5, money: -5 }, text: 'You buy the guitar. Yes, that one. The one from before. It still counts.' },
  { id: 'lottery-small', age: [18, 90], weird: 1, effects: { money: 5, happiness: 3 }, text: 'You win $500 in the lottery and tell everyone it was strategy.' },
  { id: 'audit', age: [25, 70], forbid: { smarts: 45 }, weird: 1, effects: { money: -7, happiness: -4 }, text: 'You are audited. Your filing system — a shoebox labeled "PROBABLY FINE" — does not impress.' },

  // --- elder (65+) ----------------------------------------------------------
  { id: 'retirement', age: [62, 70], once: true, effects: { happiness: 8, money: -5 }, text: 'You retire. On day three you alphabetize the spice rack and stare at the wall, thrilled.' },
  { id: 'grandkid', age: [50, 85], require: { happiness: 40 }, once: true, effects: { happiness: 9 }, text: 'A grandchild arrives and correctly identifies you as the soft touch.' },
  { id: 'hip-check', age: [68, 90], effects: { health: -7, happiness: -2 }, text: 'Your hip files a formal complaint. Mediation is ongoing.' },
  { id: 'shuffleboard-hustle', age: [65, 92], weird: 2, effects: { money: 3, happiness: 4 }, text: 'You hustle the retirement community at shuffleboard. They ban you, respectfully.' },
  { id: 'memoirs', age: [65, 90], require: { smarts: 55 }, once: true, effects: { smarts: 3, happiness: 4 }, text: 'You write your memoirs. Chapter one is 40 pages about a dog you had in the fifties.' },
  { id: 'birds', age: [60, 95], once: true, effects: { happiness: 5, smarts: 2 }, text: 'You get into birds. The birds were always there. You just finally looked up.' },
  { id: 'yoga-elders', age: [65, 88], require: { health: 40 }, effects: { health: 4, happiness: 2 }, text: 'Chair yoga. You are the class troublemaker. The instructor loves and fears you.' },
  { id: 'scam-call-reversed', age: [65, 95], require: { smarts: 60 }, weird: 3, once: true, effects: { happiness: 6, smarts: 2 }, text: 'A phone scammer calls. Ninety minutes later, he has told you about his mother and hung up in tears.' },

  // --- any age, mostly weird -------------------------------------------------
  { id: 'struck-by-mild-luck', age: [5, 95], weird: 2, effects: { happiness: 4 }, text: 'You find a $20 bill in a coat you forgot you owned. The economy of past-you pays out.' },
  { id: 'wrong-funeral', age: [18, 90], weird: 3, once: true, effects: { happiness: -2, smarts: 2 }, text: 'You attend the wrong funeral and stay out of politeness. Lovely service. Wrong Gary.' },
  { id: 'local-fame', age: [10, 90], weird: 2, once: true, effects: { happiness: 5 }, text: 'You appear on the local news for six seconds behind a reporter, waving incorrectly.' },
  { id: 'pigeon-vendetta', age: [8, 95], weird: 3, once: true, effects: { happiness: -3, health: -1 }, text: 'A specific pigeon develops a vendetta against you. Ornithologists are baffled. You are not. You know what you did.' },
  { id: 'time-capsule', age: [25, 90], weird: 2, once: true, effects: { happiness: 3, smarts: 1 }, text: 'You dig up your childhood time capsule. Past-you left a note: "hope you are rich." Awkward.' },
  { id: 'flu-season', age: [3, 95], effects: { health: -4 }, text: 'The flu. You watch fourteen hours of television about people renovating houses.' },
  { id: 'quiet-year', age: [1, 100], weird: 0, effects: { happiness: 1 }, text: 'A quiet year. Historians will skip it. You needed it.' },
  { id: 'karaoke-legend', age: [18, 85], weird: 2, once: true, effects: { happiness: 6 }, text: 'One night, one song, one flawless rendition. Strangers still describe it to people who were not there.' },
  { id: 'library-fine', age: [10, 90], weird: 1, once: true, effects: { money: -2, happiness: 2 }, text: 'You return a library book 23 years late. The librarian frames the fine receipt.' },
  { id: 'lightning-near-miss', age: [10, 90], weird: 3, once: true, effects: { health: -2, happiness: 3 }, text: 'Lightning strikes the tree you were about to stand under. You develop opinions about weather.' },
];
