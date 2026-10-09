// @ts-check
// Frases de efeito exibidas na abertura e na tela de bloqueio.
// Script clássico (não-módulo): as declarações abaixo ficam globais para o content.js.

/**
 * @typedef {Object} Quote
 * @property {string} text
 * @property {string} author
 */

/** @type {Quote[]} */
const YF_QUOTES = [
  { text: 'A vida é como andar de bicicleta. Para manter o equilíbrio, você precisa se manter em movimento.', author: 'Albert Einstein' },
  { text: 'O sucesso é ir de fracasso em fracasso sem perder o entusiasmo.', author: 'Winston Churchill' },
  { text: 'Não importa o quão devagar você vá, desde que não pare.', author: 'Confúcio' },
  { text: 'Tudo o que você sempre quis está do outro lado do medo.', author: 'George Addair' },
  { text: 'A única maneira de fazer um excelente trabalho é amar o que você faz.', author: 'Steve Jobs' },
  { text: 'Você não precisa ser ótimo para começar, mas precisa começar para ser ótimo.', author: 'Zig Ziglar' },
  { text: 'Acredite que você pode, assim você já está no meio do caminho.', author: 'Theodore Roosevelt' },
  { text: 'O futuro pertence àqueles que acreditam na beleza de seus sonhos.', author: 'Eleanor Roosevelt' },
  { text: 'Nossa maior glória não é nunca cair, mas levantar toda vez que caímos.', author: 'Confúcio' },
  { text: 'Se você pode sonhar, pode realizar.', author: 'Walt Disney' },
  { text: 'A persistência é o caminho do êxito.', author: 'Charles Chaplin' },
  { text: 'Não espere. O momento nunca será perfeito.', author: 'Napoleon Hill' },
  { text: 'Faça o que você pode, com o que você tem, onde você está.', author: 'Theodore Roosevelt' },
  { text: 'A melhor maneira de prever o futuro é criá-lo.', author: 'Peter Drucker' },
  { text: 'A força não vem da capacidade física. Vem de uma vontade indomável.', author: 'Mahatma Gandhi' },
  { text: 'Você perde 100% das oportunidades que não aproveita.', author: 'Wayne Gretzky' },
  { text: 'O homem que move uma montanha começa carregando pequenas pedras.', author: 'Confúcio' },
  { text: 'Não conte os dias; faça os dias contarem.', author: 'Muhammad Ali' },
  { text: 'É durante nossos momentos mais sombrios que devemos nos concentrar para ver a luz.', author: 'Aristóteles' },
  { text: 'A queda não é um fracasso. O fracasso é permanecer onde você caiu.', author: 'Mary Pickford' },
  { text: 'O segredo de progredir é começar.', author: 'Mark Twain' },
  { text: 'A coragem não é ausência de medo, mas o triunfo sobre ele.', author: 'Nelson Mandela' },
  { text: 'Dificuldades preparam pessoas comuns para destinos extraordinários.', author: 'C. S. Lewis' },
  { text: 'Não tenha medo de desistir do bom para buscar o excelente.', author: 'John D. Rockefeller' },
  { text: 'Grandes coisas nunca são feitas por uma única pessoa. Elas são feitas por uma equipe.', author: 'Steve Jobs' },
  { text: 'Você deve fazer aquilo que pensa que não consegue fazer.', author: 'Eleanor Roosevelt' },
  { text: 'A disciplina é a ponte entre metas e realizações.', author: 'Jim Rohn' },
  { text: 'O sucesso não é definitivo, o fracasso não é fatal: é a coragem de continuar que conta.', author: 'Winston Churchill' },
  { text: 'Quando tudo parecer estar contra você, lembre-se de que o avião decola contra o vento, não com ele.', author: 'Henry Ford' },
];

/** @returns {Quote} */
function yfRandomQuote() {
  return YF_QUOTES[Math.floor(Math.random() * YF_QUOTES.length)];
}
