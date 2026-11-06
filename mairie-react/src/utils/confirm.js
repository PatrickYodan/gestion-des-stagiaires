// Fenêtre de confirmation de l'application (remplace window.confirm).
// Utilisation : if (!(await confirmer({ titre, message, confirmer: "Supprimer", danger: true }))) return;
// La fenêtre est affichée par <ConfirmHost />, monté une seule fois dans main.jsx.

let ecouteur = null;

export const enregistrerHote = (fn) => {
  ecouteur = fn;
  return () => {
    if (ecouteur === fn) ecouteur = null;
  };
};

/**
 * @param {object} options
 * @param {string} options.titre        Question posée (ex. « Supprimer ce document ? »)
 * @param {string} [options.message]    Élément concerné ou précision principale
 * @param {string} [options.details]    Conséquence à connaître (affichée en encadré)
 * @param {string} [options.confirmer]  Libellé du bouton de confirmation
 * @param {string} [options.annuler]    Libellé du bouton d'annulation
 * @param {boolean} [options.danger]    Action destructive : bouton rouge
 * @param {string} [options.icon]       Icône de la fenêtre
 * @returns {Promise<boolean>} true si l'utilisateur confirme
 */
export const confirmer = (options) =>
  new Promise((resolve) => {
    if (!ecouteur) {
      // Hôte absent (ne devrait pas arriver) : repli sur la confirmation du navigateur
      resolve(window.confirm([options.titre, options.message, options.details].filter(Boolean).join("\n\n")));
      return;
    }
    ecouteur({ ...options, resolve });
  });
