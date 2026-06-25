// ============================================================================
// MATCHMAKING - Algoritmi di abbinamento per torneo di padel
// ============================================================================
// Due formule supportate:
//   - 'fissa':     le coppie si formano una volta (bilanciate per livello) e
//                  giocano piu' turni; cambia solo l'abbinamento coppia-vs-coppia.
//   - 'americano': ad ogni turno cambiano sia i compagni che gli avversari;
//                  l'algoritmo minimizza le ripetizioni rispettando il
//                  bilanciamento dei livelli quanto possibile.
// ============================================================================

/**
 * Genera coppie iniziali bilanciate per livello (pairing "a serpentina"):
 * ordina i giocatori per livello decrescente e accoppia il piu' forte con il
 * piu' debole rimanente, cosi' il livello medio di ogni coppia tende a essere
 * simile al livello medio generale del gruppo.
 *
 * @param {Array<{id:string, level:number}>} players
 * @returns {Array<{player1:Object, player2:Object, avgLevel:number}>}
 */
function generateBalancedPairs(players) {
    if (players.length < 2) return [];

    const sorted = [...players].sort((a, b) => b.level - a.level);
    const pairs = [];
    let left = 0;
    let right = sorted.length - 1;

    while (left < right) {
        const p1 = sorted[left];
        const p2 = sorted[right];
        pairs.push({
            player1: p1,
            player2: p2,
            avgLevel: (p1.level + p2.level) / 2
        });
        left++;
        right--;
    }

    // giocatore dispari rimasto senza compagno: lo segnaliamo al chiamante
    if (left === right) {
        pairs.push({ player1: sorted[left], player2: null, avgLevel: sorted[left].level });
    }

    return pairs;
}

/**
 * Abbina le coppie tra loro per generare le partite di un turno, bilanciando
 * il livello medio delle coppie contrapposte e -quando esiste uno storico-
 * evitando di far rigiocare le stesse coppie avversarie consecutivamente.
 *
 * @param {Array} pairs - coppie con avgLevel
 * @param {Set<string>} previousOpponentKeys - chiavi "pairIdA|pairIdB" gia' giocate
 * @returns {Array<{pairA:Object, pairB:Object}>}
 */
function matchPairsForRound(pairs, previousOpponentKeys = new Set()) {
    const sorted = [...pairs].sort((a, b) => a.avgLevel - b.avgLevel);
    const available = [...sorted];
    const matches = [];

    while (available.length >= 2) {
        const pairA = available.shift();
        // cerca tra le rimanenti la coppia con livello piu' simile che non sia
        // gia' stata avversaria di pairA, se possibile
        let bestIndex = 0;
        let bestScore = Infinity;
        for (let i = 0; i < available.length; i++) {
            const candidate = available[i];
            const key1 = `${pairA.id}|${candidate.id}`;
            const key2 = `${candidate.id}|${pairA.id}`;
            const alreadyPlayed = previousOpponentKeys.has(key1) || previousOpponentKeys.has(key2);
            const levelDiff = Math.abs(pairA.avgLevel - candidate.avgLevel);
            // penalita' forte se gia' affrontati, cosi' l'algoritmo preferisce
            // un avversario diverso anche a costo di un dislivello leggermente maggiore
            const score = levelDiff + (alreadyPlayed ? 1000 : 0);
            if (score < bestScore) {
                bestScore = score;
                bestIndex = i;
            }
        }
        const pairB = available.splice(bestIndex, 1)[0];
        matches.push({ pairA, pairB });
    }

    return matches;
}

/**
 * Genera il turno per la formula "fissa": riusa le coppie esistenti (passate
 * come argomento, già create una volta per tutto il torneo) e calcola solo i
 * nuovi abbinamenti coppia-vs-coppia per questo turno.
 *
 * @param {Array} existingPairs - coppie fisse del torneo
 * @param {Set<string>} previousOpponentKeys
 */
function generateFixedFormulaRound(existingPairs, previousOpponentKeys = new Set()) {
    if (existingPairs.length < 2) {
        throw new Error('Sono necessarie almeno 2 coppie per generare un turno.');
    }
    return matchPairsForRound(existingPairs, previousOpponentKeys);
}

/**
 * Genera il turno per la formula "americano": ricalcola compagni E avversari
 * da zero ad ogni turno, minimizzando le ripetizioni (sia di compagni che di
 * avversari) tramite un approccio a tentativi multipli (random restart):
 * prova diverse formazioni casuali di coppie e tiene quella con il punteggio
 * di penalita' piu' basso.
 *
 * Penalita' (in ordine di peso):
 *   1. Aver gia' giocato come compagni in un turno precedente (peso altissimo)
 *   2. Aver gia' giocato come avversari in un turno precedente (peso alto)
 *   3. Dislivello di livello nella coppia / tra coppie avversarie (peso basso)
 *
 * @param {Array<{id, name, level}>} players
 * @param {Set<string>} previousPartnerKeys - chiavi "playerIdA|playerIdB" gia' giocate insieme
 * @param {Set<string>} previousOpponentPlayerKeys - chiavi giocatore-vs-giocatore gia' avversari
 * @param {number} attempts - numero di tentativi random restart (default 200)
 */
function generateAmericanoRound(players, previousPartnerKeys = new Set(), previousOpponentPlayerKeys = new Set(), attempts = 200) {
    const usablePlayers = [...players];
    // Se il numero di giocatori non e' multiplo di 4, gli ultimi che non
    // entrano in un quartetto completo riposano questo turno (riposo segnalato
    // al chiamante tramite il campo "resting").
    const playableCount = Math.floor(usablePlayers.length / 4) * 4;

    if (playableCount < 4) {
        throw new Error('Sono necessari almeno 4 giocatori per generare un turno.');
    }

    let bestAttempt = null;
    let bestScore = Infinity;

    for (let attempt = 0; attempt < attempts; attempt++) {
        const shuffled = shuffleArray(usablePlayers);
        const resting = shuffled.slice(playableCount);
        const playing = shuffled.slice(0, playableCount);

        // forma le coppie a caso per questo tentativo
        const pairsThisAttempt = [];
        for (let i = 0; i < playing.length; i += 2) {
            pairsThisAttempt.push({
                player1: playing[i],
                player2: playing[i + 1],
                avgLevel: (playing[i].level + playing[i + 1].level) / 2
            });
        }

        // penalita' per ripetizione compagni
        let partnerPenalty = 0;
        pairsThisAttempt.forEach(pair => {
            const key = partnerKey(pair.player1.id, pair.player2.id);
            if (previousPartnerKeys.has(key)) partnerPenalty += 100;
        });

        // abbina le coppie tra loro bilanciando il livello (greedy semplice per questo tentativo)
        const sortedPairs = [...pairsThisAttempt].sort((a, b) => a.avgLevel - b.avgLevel);
        const matchesThisAttempt = [];
        const tempAvailable = [...sortedPairs];
        let opponentPenalty = 0;
        let levelPenalty = 0;

        while (tempAvailable.length >= 2) {
            const pairA = tempAvailable.shift();
            let bestIdx = 0;
            let bestLocalScore = Infinity;
            for (let i = 0; i < tempAvailable.length; i++) {
                const candidate = tempAvailable[i];
                const diff = Math.abs(pairA.avgLevel - candidate.avgLevel);
                let penalty = 0;
                // conta quanti giocatori di pairA hanno gia' affrontato quanti di candidate
                [pairA.player1, pairA.player2].forEach(p1 => {
                    [candidate.player1, candidate.player2].forEach(p2 => {
                        if (previousOpponentPlayerKeys.has(opponentKey(p1.id, p2.id))) {
                            penalty += 50;
                        }
                    });
                });
                const score = diff + penalty;
                if (score < bestLocalScore) {
                    bestLocalScore = score;
                    bestIdx = i;
                }
            }
            const pairB = tempAvailable.splice(bestIdx, 1)[0];
            matchesThisAttempt.push({ pairA, pairB });
            levelPenalty += Math.abs(pairA.avgLevel - pairB.avgLevel);
        }

        // ricalcola la penalita' totale di avversari per il punteggio complessivo del tentativo
        matchesThisAttempt.forEach(({ pairA, pairB }) => {
            [pairA.player1, pairA.player2].forEach(p1 => {
                [pairB.player1, pairB.player2].forEach(p2 => {
                    if (previousOpponentPlayerKeys.has(opponentKey(p1.id, p2.id))) {
                        opponentPenalty += 50;
                    }
                });
            });
        });

        const totalScore = partnerPenalty * 10 + opponentPenalty + levelPenalty;

        if (totalScore < bestScore) {
            bestScore = totalScore;
            bestAttempt = { pairs: pairsThisAttempt, matches: matchesThisAttempt, resting };
        }

        // early exit se troviamo una soluzione perfetta (nessuna ripetizione)
        if (bestScore === 0) break;
    }

    return bestAttempt;
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function shuffleArray(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function partnerKey(id1, id2) {
    return [id1, id2].sort().join('|');
}

function opponentKey(id1, id2) {
    return [id1, id2].sort().join('|');
}

/**
 * Costruisce gli insiemi di storico (compagni e avversari) a partire dalle
 * coppie e partite gia' generate nei turni precedenti di un torneo, da
 * passare poi a generateAmericanoRound per evitare ripetizioni.
 *
 * @param {Array} previousPairs - tutte le coppie create nei turni precedenti del torneo
 * @param {Array} previousMatches - tutte le partite (con pairA/pairB) dei turni precedenti
 */
function buildHistoryFromPreviousRounds(previousPairs, previousMatches) {
    const partnerKeys = new Set();
    const opponentPlayerKeys = new Set();

    previousPairs.forEach(pair => {
        if (pair.player1 && pair.player2) {
            partnerKeys.add(partnerKey(pair.player1.id, pair.player2.id));
        }
    });

    previousMatches.forEach(match => {
        const { pairA, pairB } = match;
        if (!pairA || !pairB) return;
        [pairA.player1, pairA.player2].forEach(p1 => {
            [pairB.player1, pairB.player2].forEach(p2 => {
                if (p1 && p2) opponentPlayerKeys.add(opponentKey(p1.id, p2.id));
            });
        });
    });

    return { partnerKeys, opponentPlayerKeys };
}

// Esporta per uso in Node (test) e nel browser (script globale)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        generateBalancedPairs,
        matchPairsForRound,
        generateFixedFormulaRound,
        generateAmericanoRound,
        buildHistoryFromPreviousRounds,
        shuffleArray,
        partnerKey,
        opponentKey
    };
}
