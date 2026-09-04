data {
  int<lower=0> N;
  int<lower=0, upper=N> successes;
}
parameters {
  real<lower=0, upper=1> theta;
}
model {
  theta ~ beta(1, 1);
  successes ~ binomial(N, theta);
}
generated quantities {
  int successes_rep = binomial_rng(N, theta);
}
