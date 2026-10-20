// Sur téléphone, chaque ligne de tableau s'affiche comme une carte (voir index.css, « Tableaux en cartes »).
// Pour afficher le nom de la colonne devant chaque valeur, on recopie le texte de l'en-tête
// dans l'attribut data-label de chaque cellule. Un observateur maintient ces libellés à jour
// quand React affiche de nouvelles lignes.

const labelTables = () => {
  document.querySelectorAll("table.table").forEach((table) => {
    // data-label sur l'en-tête permet un libellé plus court que son contenu (ex. sans le nombre de comptes)
    const headers = [...table.querySelectorAll("thead th")].map((th) => th.dataset.label || th.textContent.trim());
    if (!headers.length) return;
    table.querySelectorAll("tbody tr").forEach((tr) => {
      [...tr.children].forEach((td, i) => {
        // Une cellule qui occupe toute la ligne (message « aucun résultat »…) n'a pas de libellé
        const label = td.colSpan > 1 ? "" : headers[i] || "";
        if (td.dataset.label !== label) td.dataset.label = label;
      });
    });
  });
};

export const startTableLabels = () => {
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      labelTables();
    });
  };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  schedule();
};
