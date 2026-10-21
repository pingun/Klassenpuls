// gezeichnete Zelle als Beispielbild für die Vorschau
const SAMPLE_CELL = 'data:image/svg+xml;utf8,' + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='800' height='500' viewBox='0 0 800 500'><rect width='800' height='500' fill='#fbf7f2'/><ellipse cx='400' cy='250' rx='340' ry='210' fill='#f6e4c8' stroke='#c99b6b' stroke-width='6'/><ellipse cx='450' cy='240' rx='80' ry='70' fill='#d9b8d6' stroke='#8d5a8a' stroke-width='5'/><circle cx='465' cy='230' r='22' fill='#8d5a8a'/><ellipse cx='250' cy='310' rx='55' ry='24' fill='#c9ddb4' stroke='#6b7a10' stroke-width='4' transform='rotate(-20 250 310)'/><ellipse cx='590' cy='150' rx='45' ry='20' fill='#c9ddb4' stroke='#6b7a10' stroke-width='4' transform='rotate(25 590 150)'/><ellipse cx='300' cy='160' rx='40' ry='18' fill='#f4c7a8' stroke='#b35c1e' stroke-width='4'/><ellipse cx='560' cy='360' rx='38' ry='17' fill='#f4c7a8' stroke='#b35c1e' stroke-width='4' transform='rotate(-15 560 360)'/><g fill='#a9c4d9'><circle cx='200' cy='220' r='7'/><circle cx='340' cy='380' r='7'/><circle cx='650' cy='260' r='7'/><circle cx='380' cy='110' r='7'/><circle cx='480' cy='400' r='7'/></g></svg>")

// Farbpalette für die Items des 4-Felder-Typs (neue Items bekommen reihum die nächste Farbe)
export const MATRIX_COLORS = ['#4f6ad8', '#e8615a', '#2b3a73', '#8d86e0', '#a3333d', '#f2a19a', '#6a58c4', '#2f7f74', '#d9902f', '#5f6b7a', '#c2558f', '#7aa63a']

export const QUESTION_TYPES = {
  multiple_choice: {
    label: 'Multiple Choice',
    icon: '◉',
    hint: 'Schüler wählen eine oder mehrere Antworten.',
    explain: 'Die Schüler tippen auf eine Antwort – oder auf mehrere, wenn du „Mehrfachauswahl“ aktivierst. Am Beamer wachsen die Säulen live mit jeder Stimme. Ideal für Wissensabfragen, Meinungsbilder und schnelle Entscheidungen.',
    sample: {
      prompt: 'Wie möchtest du am liebsten arbeiten?',
      options: ['Allein', 'Zu zweit', 'In Gruppen', 'Ganze Klasse'],
      settings: { multiple: true },
      answers: [...Array(4).fill({ choices: [0] }), ...Array(9).fill({ choices: [1] }), ...Array(6).fill({ choices: [2] }), ...Array(3).fill({ choices: [3] })],
    },
    optionLabel: 'Antwortmöglichkeiten',
    defaults: () => ({ options: ['', ''], settings: { multiple: false } }),
  },
  ranking: {
    label: 'Ranking',
    icon: '⇅',
    hint: 'Schüler bringen die Punkte in ihre Reihenfolge.',
    explain: 'Die Schüler tippen die Punkte in der Reihenfolge an, die ihnen am wichtigsten ist. Am Beamer entsteht daraus eine gemeinsame Rangliste mit dem durchschnittlichen Platz jedes Punktes. Gut für Prioritäten, Themenwünsche oder Abstimmungen über Projekte.',
    sample: {
      prompt: 'Was ist dir beim Lernen am wichtigsten?',
      options: ['Verständliche Erklärungen', 'Selbst ausprobieren', 'Gruppenarbeit', 'Bezug zum Alltag'],
      settings: {},
      answers: [{ order: [0, 1, 3, 2] }, { order: [1, 0, 3, 2] }, { order: [0, 3, 1, 2] }, { order: [0, 1, 2, 3] }, { order: [3, 0, 1, 2] }, { order: [1, 0, 2, 3] }],
    },
    optionLabel: 'Zu sortierende Punkte',
    defaults: () => ({ options: ['', '', ''], settings: {} }),
  },
  scale: {
    label: 'Skala',
    icon: '▭',
    hint: 'Aussagen auf einer Skala bewerten (z. B. 1–5).',
    explain: 'Die Schüler bewerten eine oder mehrere Aussagen mit einem Schieberegler (z. B. von 1 bis 5). Am Beamer zeigt eine geschwungene Fläche, wie sich die Antworten verteilen, und ein Punkt markiert den Durchschnitt. Ideal, um Erwartungen, Vorwissen oder Stimmungen sichtbar zu machen.',
    sample: {
      prompt: 'Was erwartest du von der heutigen Stunde?',
      options: ['Ich möchte viel lernen', 'Ich möchte diskutieren', 'Ich will Spaß haben'],
      settings: { min: 1, max: 5, minLabel: 'trifft gar nicht zu', maxLabel: 'trifft voll zu' },
      answers: [[4, 3, 2], [5, 4, 3], [4, 5, 5], [3, 4, 3], [5, 3, 4], [4, 5, 2], [4, 4, 5], [5, 2, 3]].map((values) => ({ values })),
    },
    optionLabel: 'Aussagen',
    defaults: () => ({ options: [''], settings: { min: 1, max: 5, minLabel: 'gar nicht', maxLabel: 'sehr' } }),
  },
  open: {
    label: 'Offene Frage',
    icon: '✎',
    hint: 'Freitext – als Wortwolke oder Pinnwand.',
    explain: 'Die Schüler schreiben eine kurze Antwort (bis 200 Zeichen). Am Beamer erscheinen die Antworten als bunte Notizzettel auf einer Pinnwand – oder als Wortwolke, in der häufige Antworten größer dargestellt werden. Gut für Brainstorming, Fragen, Sorgen und Feedback.',
    sample: {
      prompt: 'Was erwartest du von dieser Einheit?',
      options: [],
      settings: { display: 'wall' },
      answers: ['Spannende Experimente', 'Mehr Gruppenarbeit', 'Gute Vorbereitung auf die Klausur', 'Bezug zum Alltag', 'Klare Erklärungen', 'Weniger Hausaufgaben', 'Spaß am Thema', 'Filme und Videos'].map((text) => ({ text })),
    },
    optionLabel: null,
    defaults: () => ({ options: [], settings: { display: 'wall' } }),
  },
  pin: {
    label: 'Bild anheften',
    icon: '📍',
    hint: 'Schüler setzen einen Pin auf dein Bild.',
    explain: 'Du lädst ein Bild hoch – eine Karte, ein Diagramm, eine Abbildung aus dem Buch. Die Schüler tippen auf die Stelle, die sie für richtig halten, und setzen dort ihren Pin. Am Beamer erscheinen alle Pins auf dem Bild, Häufungen sind sofort sichtbar. Ideal für „Wo liegt …?“, „Zeige auf …“ oder Bildanalysen.',
    sample: {
      prompt: 'Wo befindet sich der Zellkern?',
      options: [],
      settings: { image_url: SAMPLE_CELL },
      answers: [[0.56, 0.47], [0.58, 0.5], [0.54, 0.45], [0.6, 0.48], [0.57, 0.52], [0.55, 0.5], [0.59, 0.44], [0.53, 0.49],
        [0.3, 0.62], [0.32, 0.6], [0.74, 0.3], [0.57, 0.47]].map(([x, y]) => ({ x, y })),
    },
    optionLabel: null,
    defaults: () => ({ options: [], settings: { image_url: null, image_path: null } }),
  },
  matrix: {
    label: '4-Felder',
    icon: '▦',
    hint: 'Items auf zwei Achsen einordnen (je 1–10).',
    explain: 'Du legst Items fest und benennst die beiden Achsen, z. B. „Aufwand“ und „Wirkung“. Die Schüler bewerten jedes Item mit zwei Schiebereglern von 1 bis 10 und können Items überspringen. Am Beamer erscheint jedes Item als Farbpunkt an seiner Durchschnittsposition in einer Matrix aus vier Feldern. Ideal für Priorisierungen, Selbsteinschätzungen und Bewertungen.',
    sample: {
      prompt: 'Wie schätzt ihr die Methoden ein?',
      options: ['Gruppenpuzzle', 'Stationenlernen', 'Lehrervortrag', 'Lernvideo', 'Projektarbeit'],
      settings: { xLabel: 'Aufwand', yLabel: 'Lernwirkung', colors: ['#4f6ad8', '#e8615a', '#2b3a73', '#8d86e0', '#a3333d'] },
      answers: [
        [[6, 8], [5, 7], [2, 4], [3, 5], [9, 9]], [[7, 9], [6, 6], [2, 3], [2, 6], [8, 8]],
        [[5, 7], null, [3, 4], [3, 4], [9, 7]], [[6, 8], [5, 8], [1, 5], null, [8, 9]],
      ].map((values) => ({ values })),
    },
    optionLabel: null,
    defaults: () => ({ options: ['', ''], settings: { xLabel: '', yLabel: '', colors: [MATRIX_COLORS[0], MATRIX_COLORS[1]] } }),
  },
  qa: {
    label: 'Q&A',
    icon: '🙋',
    hint: 'Schüler stellen Fragen und bewerten sie mit Daumen hoch.',
    explain: 'Die Schüler reichen während der Stunde eigene Fragen ein – so viele sie möchten. Wenn du es erlaubst, sehen sie die Fragen der anderen und können sie mit Daumen hoch unterstützen. Am Beamer erscheint eine Frage nach der anderen, die meistgewünschte zuerst. Auf Wunsch gibst du jede Frage vorher frei.',
    sample: {
      prompt: 'Zeit für Fragen',
      options: [],
      settings: { voting: true, moderate: false },
      answers: [{ id: 'a', text: 'Kommt das Thema auch in der Klassenarbeit dran?', votes: 12 }, { id: 'b', text: 'Können wir das Experiment noch einmal wiederholen?', votes: 7 }, { id: 'c', text: 'Wo finde ich die Lösungen zu den Übungen?', votes: 3 }],
    },
    optionLabel: null,
    defaults: () => ({ prompt: 'Zeit für Fragen', options: [], settings: { voting: true, moderate: false } }),
  },
}

export function blankQuestion(type = 'multiple_choice') {
  return { type, prompt: '', ...QUESTION_TYPES[type].defaults() }
}

// Wo der Schülername in der Auswertung auftaucht: Pinnwand (am Beamer) und Pins (beim Darüberfahren).
// Bei allen anderen Fragen wird kein Name abgefragt oder gespeichert.
export function nameUsage(q) {
  if (q?.type === 'open' && q.settings?.display !== 'cloud') return 'Mit Namen steht er am Beamer unter deiner Antwort auf der Pinnwand.'
  if (q?.type === 'pin') return 'Mit Namen kann dein Lehrer sehen, welcher Pin von dir ist.'
  return null
}

// Vorlagen – jede erzeugt eine vollständige, wiederverwendbare Umfrage
export const TEMPLATES = [
  {
    key: 'expectations',
    title: 'Erwartungen der Schüler managen',
    description: 'Zu Beginn einer Einheit Erwartungen, Vorwissen, Wünsche und Sorgen sichtbar machen.',
    questions: [
      { type: 'open', prompt: 'Was erwartest du von dieser Unterrichtseinheit?', options: [], settings: { display: 'wall' } },
      { type: 'scale', prompt: 'Wo stehst du gerade?', options: [
        'Ich kenne mich mit dem Thema schon aus',
        'Ich freue mich auf das Thema',
        'Ich weiß, wofür ich das Thema brauche',
      ], settings: { min: 1, max: 5, minLabel: 'trifft nicht zu', maxLabel: 'trifft voll zu' } },
      { type: 'ranking', prompt: 'Was ist dir beim Lernen am wichtigsten?', options: [
        'Verständliche Erklärungen', 'Viel selbst ausprobieren', 'Zusammenarbeit in Gruppen', 'Klare Ziele und Bewertungskriterien', 'Bezug zum Alltag',
      ], settings: {} },
      { type: 'multiple_choice', prompt: 'Wie möchtest du am liebsten arbeiten?', options: [
        'Allein', 'Zu zweit', 'In Gruppen', 'Gemeinsam mit der ganzen Klasse',
      ], settings: { multiple: true } },
      { type: 'open', prompt: 'Was bereitet dir Sorgen oder was sollte ich als Lehrer wissen?', options: [], settings: { display: 'wall' } },
      { type: 'open', prompt: 'Beschreibe in einem Wort, wie du dich gerade fühlst.', options: [], settings: { display: 'cloud' } },
    ],
  },
  {
    key: 'feedback',
    title: 'Feedback zur Stunde',
    description: 'Kurzes Stimmungsbild am Ende einer Stunde.',
    questions: [
      { type: 'scale', prompt: 'Wie war die Stunde für dich?', options: ['Ich habe etwas gelernt', 'Das Tempo war passend', 'Die Aufgaben waren verständlich'], settings: { min: 1, max: 5, minLabel: 'gar nicht', maxLabel: 'sehr' } },
      { type: 'multiple_choice', prompt: 'Wie sicher fühlst du dich jetzt mit dem Thema?', options: ['Sehr sicher', 'Eher sicher', 'Eher unsicher', 'Sehr unsicher'], settings: { multiple: false } },
      { type: 'open', prompt: 'Was sollten wir nächste Stunde noch einmal aufgreifen?', options: [], settings: { display: 'wall' } },
    ],
  },
]
