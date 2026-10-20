// Indicateur simple de robustesse d'un mot de passe (0 à 4)
export const passwordScore = (pwd) => {
  if (!pwd) return 0;
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
  if (/\d/.test(pwd) && /[^A-Za-z0-9]/.test(pwd)) score++;
  return score;
};

export const scoreLabels = ["Trop court", "Faible", "Moyen", "Bon", "Excellent"];
