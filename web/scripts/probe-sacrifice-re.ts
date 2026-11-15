const re = /\bsacrifices? (?:a |an |all )?[\w ]+(?: of their choice)?/i;
const t = "sacrifices a land of their choice.";
console.log(t.match(re));
