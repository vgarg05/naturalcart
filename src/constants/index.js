export const AISLE_ICONS = {
  'Produce':      '🥦',
  'Dairy':        '🧀',
  'Meat':         '🥩',
  'Pantry':       '🫙',
  'Spices':       '🌶️',
  'Bakery':       '🍞',
  'Frozen':       '🧊',
  'Beverages':    '🥤',
  'Snacks':       '🍿',
  'Seafood':      '🐟',
  'Canned Goods': '🥫',
  'Condiments':   '🫒',
  'Grains':       '🌾',
  'Oils':         '🫛',
  'default':      '🛍️'
};

export const FILTER_META = {
  'vegetarian': {
    label: 'Vegetarian',
    rule: 'Replace all meat (chicken, beef, lamb, pork, seafood) with vegetarian alternatives like paneer, tofu, or chickpeas. Keep dairy products.'
  },
  'vegan': {
    label: 'Vegan',
    rule: 'Replace ALL animal products — meat, poultry, seafood, dairy, eggs, honey — with plant-based alternatives like tofu, tempeh, oat milk, flax eggs, or coconut cream.'
  },
  'gluten-free': {
    label: 'Gluten-Free',
    rule: 'Exclude all gluten-containing ingredients (wheat flour, regular pasta, regular bread, regular soy sauce). Substitute with gluten-free versions (rice flour, GF pasta, GF bread, tamari).'
  }
};

export const SUGGESTIONS = [
  {
    emoji: '🍛',
    title: 'Indian feast night',
    sub: 'Butter chicken + dal for 6',
    text: 'Butter chicken and dal makhani for 6 people this week'
  },
  {
    emoji: '🍝',
    title: 'Sunday pasta night',
    sub: 'Pasta, garlic bread, salad for 4',
    text: 'Sunday pasta night for 4 people, with garlic bread and a Caesar salad'
  },
  {
    emoji: '🥗',
    title: '5-day healthy prep',
    sub: 'Chicken, quinoa, smoothies · 1 person',
    text: 'Healthy meal prep for 5 weekdays, single person — grilled chicken, quinoa bowls, and smoothies'
  },
  {
    emoji: '🌮',
    title: 'Taco Tuesday',
    sub: 'Beef tacos + guac + margs for 8',
    text: 'Taco Tuesday for 8 people with beef tacos, guacamole, and margaritas'
  }
];
