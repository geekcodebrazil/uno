// ===== Elementos do DOM =====
const playerHandElement = document.getElementById('player-hand');
const opponentHandElement = document.querySelector('.opponent-hand .card--back');
const deckPileElement = document.getElementById('deck-pile');
const discardPileElement = document.getElementById('discard-pile');
const drawCardBtn = document.getElementById('draw-card-btn'); // Botão Comprar Carta
const unoBtn = document.getElementById('uno-btn');
const gameStatusElement = document.getElementById('game-status');
const colorPickerModal = document.getElementById('color-picker-modal');
const colorButtons = document.querySelectorAll('.color-btn');
const currentYearElement = document.getElementById('current-year');
const playerZoneElement = document.querySelector('.player-area');
const opponentZoneElement = document.querySelector('.opponent-area');

// ===== Variáveis de Estado do Jogo =====
let deck = [];
let discardPile = [];
let players = [];
let currentPlayerIndex = 0;
let gameDirection = 1;
let currentValidColor = null;
let currentValidValue = null;
let mustDrawCards = 0;
let playerMustPlayOrDraw = false;
let wildColorChoiceCallback = null;
let unoCalled = [false, false];
let canCallUno = [false, false];
let botThinking = false;
let botNextColorChoice = null;
let gameOver = false;
// let unoPenaltyTimer = null; // Para guardar o timer da penalidade UNO (opcional avançado)

// ===== Constantes do Jogo =====
const COLORS = ['red', 'blue', 'green', 'yellow'];
const VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2'];
const SPECIAL_VALUES = ['wild', 'wild4'];
const CARDS_PER_PLAYER = 7;
const BOT_TURN_DELAY_MS = 1500;

// ===== Funções do Jogo =====

/** Cria um baralho padrão de UNO. */
function createDeck() {
    const newDeck = [];
    COLORS.forEach(color => {
        newDeck.push({ color, value: '0', id: `${color}-0` });
        for (let i = 1; i <= 9; i++) { newDeck.push({ color, value: String(i), id: `${color}-${i}-a` }); newDeck.push({ color, value: String(i), id: `${color}-${i}-b` }); }
        ['skip', 'reverse', 'draw2'].forEach(value => { newDeck.push({ color, value, type: 'action', id: `${color}-${value}-a` }); newDeck.push({ color, value, type: 'action', id: `${color}-${value}-b` }); });
    });
    for (let i = 0; i < 4; i++) { newDeck.push({ color: 'special', value: 'wild', type: 'wild', id: `wild-${i}` }); newDeck.push({ color: 'special', value: 'wild4', type: 'wild', id: `wild4-${i}` }); }
    console.log(`Deck criado: ${newDeck.length} cartas.`);
    return newDeck;
}

/** Embaralha um array (Fisher-Yates). */
function shuffleDeck(array) {
    console.log(`Embaralhando: ${array.length} cartas.`);
    for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; }
}

/** Distribui cartas aos jogadores. */
function dealCards() {
    console.log(`Distribuindo ${CARDS_PER_PLAYER} cartas para ${players.length} jogadores.`);
    for (let i = 0; i < CARDS_PER_PLAYER; i++) {
        players.forEach(player => {
            if (gameOver) return; // Interrompe se erro ocorreu
            if (deck.length === 0 && !reshuffleDiscardPile()) { // Tenta reembaralhar se necessário
                 setStatusMessage("Erro crítico: Falha ao distribuir cartas!", true); endGame(null, true); return;
             }
             if (deck.length === 0) { // Checa de novo após tentativa
                setStatusMessage("Erro crítico: Deck vazio inesperadamente!", true); endGame(null, true); return;
            }
            drawCardFromDeck(player.id, 1, false); // Compra 1 sem atualizar UI
        });
        if (gameOver) return;
    }
    console.log(`Distribuição OK. Deck: ${deck.length}.`);
    players.forEach(p => console.log(`  Jogador ${p.id} (${p.name}): ${p.hand.length} cartas.`));
}

/** Inicia ou reinicia o jogo. */
function startGame() {
    console.log("================ INICIANDO NOVO JOGO ================");
    gameOver = false; botThinking = false;
    deck = createDeck(); shuffleDeck(deck);
    discardPile = []; mustDrawCards = 0; playerMustPlayOrDraw = false;
    players = [ { id: 0, hand: [], isBot: false, name: "Você" }, { id: 1, hand: [], isBot: true, name: "Bot" } ];
    currentPlayerIndex = 0; gameDirection = 1; wildColorChoiceCallback = null;
    unoCalled = [false, false]; canCallUno = [false, false]; botNextColorChoice = null;
    if (currentYearElement) currentYearElement.textContent = new Date().getFullYear();
    // Limpa UI
    setStatusMessage("Embaralhando...");
    playerZoneElement?.classList.remove('active-turn', 'has-uno');
    opponentZoneElement?.classList.remove('active-turn', 'has-uno');
    const oldRestartButton = gameStatusElement?.querySelector('.btn--restart');
    if (oldRestartButton) { // Remove botão/br antigos
        oldRestartButton.previousElementSibling?.remove(); // Remove BR
        oldRestartButton.remove();
    }

    dealCards(); if (gameOver) return; // Sai se houve erro na distribuição

    // Pega a primeira carta válida para descarte
    let firstCard = null; let firstCardIndex = -1;
    try { firstCardIndex = deck.findIndex(card => card && card.type !== 'wild'); } catch(e){ console.error("Erro no findIndex do deck", e); }

    if (firstCardIndex === -1) { // Se só tem coringas (raro) ou erro
         console.warn("Não achou carta inicial válida? Tentando recuperação...");
         // Estratégia simples: Usa a última carta do deck se houver alguma
          firstCardIndex = deck.length -1;
         if(firstCardIndex < 0) { console.error("ERRO IRRECUPERÁVEL: Deck completamente vazio após distribuir!"); endGame(null, true); return; }
    }

    firstCard = deck.splice(firstCardIndex, 1)[0];
    if (!firstCard) { console.error("ERRO CRÍTICO: Falha ao obter carta inicial!"); endGame(null, true); return; }

    discardPile.push(firstCard);
    currentValidColor = firstCard.color === 'special' ? null : firstCard.color; // Se for coringa +4, cor será definida
    currentValidValue = firstCard.value;
    console.log(`Setup OK. Deck: ${deck.length}. Descarte: ${discardPile.length} (${firstCard.id}). Válido: ${currentValidColor} ${currentValidValue}`);

    // Atraso para aplicar efeito inicial e iniciar jogo
    setTimeout(() => {
        if (gameOver) return; // Não executa se o jogo já terminou por algum erro
        console.log("Timeout: Aplicando efeito inicial, CP=", currentPlayerIndex);
        handleInitialCardEffect(firstCard); // Pode mudar currentPlayerIndex
        console.log("Timeout: Após efeito inicial, CP=", currentPlayerIndex);

        if (players && players[currentPlayerIndex]) {
            setStatusMessage(`É a vez de ${players[currentPlayerIndex].name}!`);
        } else { console.error("Erro: Jogador inválido pós-efeito!", currentPlayerIndex); setStatusMessage("Erro ao iniciar!", true); gameOver = true; return; }

        // Define indicador de turno
        playerZoneElement?.classList.remove('active-turn'); opponentZoneElement?.classList.remove('active-turn');
        if (!gameOver) { if (currentPlayerIndex === 0) playerZoneElement?.classList.add('active-turn'); else opponentZoneElement?.classList.add('active-turn'); }

        updateUI(); console.log("Primeiro updateUI chamado.");

        // Verifica quem começa e libera/chama
        if (!gameOver && players[currentPlayerIndex]?.isBot) {
            console.log("Bot começa."); botThinking = true; triggerBotTurn();
        } else if (!gameOver && players[currentPlayerIndex]) { // Humano
            console.log("Humano começa."); botThinking = false; updateUI(); // Atualiza botões/highlight
        }
    }, 600); // Aumentado levemente para dar tempo de ver
}

/** Lida com efeitos da primeira carta (Skip, Reverse, Draw2). */
function handleInitialCardEffect(card) {
    console.log("Avaliando 1a carta:", card?.id);
    if (!card || !players || players.length === 0 || card.type === 'wild') { // Wild ou inválido não tem efeito aqui
        mustDrawCards = 0; playerMustPlayOrDraw = false; return;
    }
    // Só ações coloridas podem ter efeito
    if (card.type !== 'action' || card.color === 'special') {
        mustDrawCards = 0; playerMustPlayOrDraw = false; return;
    }

    const initialPlayerIndex = currentPlayerIndex;
    if (!players[initialPlayerIndex]) { console.error("Erro: Jogador inicial inválido."); return; }
    const initialPlayerName = players[initialPlayerIndex].name;
    let skipEffectApplied = false;

    switch (card.value) {
        case 'skip':
            console.log(`Efeito inicial: Skip! ${initialPlayerName} perde vez.`);
            currentPlayerIndex = (initialPlayerIndex + gameDirection + players.length) % players.length;
            skipEffectApplied = true; setStatusMessage(`Inicial: Pular! ${initialPlayerName} perde a vez.`); break;
        case 'reverse':
             console.log(`Efeito inicial: Reverse! ${initialPlayerName} perde vez.`);
            currentPlayerIndex = (initialPlayerIndex + gameDirection + players.length) % players.length; // Igual Skip com 2p
            skipEffectApplied = true; setStatusMessage(`Inicial: Reverter! ${initialPlayerName} perde a vez.`); break;
        case 'draw2':
            console.log(`Efeito inicial: +2! ${initialPlayerName} compra 2.`);
             if (deck.length < 2 && discardPile.length <= 1) { // Checa se PODE comprar 2
                console.error("Erro: Não há cartas para o +2 inicial!"); setStatusMessage("Erro cartas +2 inicial!", true); endGame(null, true); return;
             }
             drawCardFromDeck(initialPlayerIndex, 2, false); if (gameOver) return; // Jogo pode ter acabado aqui
             currentPlayerIndex = (initialPlayerIndex + gameDirection + players.length) % players.length; // Próximo jogador começa
             skipEffectApplied = true; // Compra inicial também pula
             setStatusMessage(`Inicial: +2! ${initialPlayerName} compra 2 e perde a vez.`); break;
    }

    // Reseta flags de compra sempre após efeito inicial
    mustDrawCards = 0; playerMustPlayOrDraw = false;
    if (skipEffectApplied) console.log(`Efeito pulou. Próximo jogador: ${currentPlayerIndex}.`);
}

/** Compra cartas do baralho. */
function drawCardFromDeck(playerId, count = 1, update = true) {
    if (gameOver) return [];
    const player = players.find(p => p.id === playerId); if (!player) return [];
    let drawnCards = [];
    console.log(`Jogador ${playerId} compra ${count}. Deck: ${deck.length}, Descarte: ${discardPile.length}.`);
    for (let i = 0; i < count; i++) {
        if (deck.length === 0 && !reshuffleDiscardPile()) { // Tenta reembaralhar se deck zerar
            console.warn(`Impossível comprar mais (comprou ${drawnCards.length}/${count}).`);
            if (drawnCards.length === 0 && deck.length === 0) { endGame(null, true); } // Empate se NADA pode ser comprado
            return drawnCards;
        }
        if (deck.length === 0) { console.error("CRÍTICO: Deck ainda vazio pós-reshuffle!"); endGame(null, true); return drawnCards; }
        const card = deck.pop();
        if (card) { player.hand.push(card); drawnCards.push(card); }
        else { console.error("ERRO: pop() falhou!"); return drawnCards; }
    }
    console.log(`Jogador ${playerId} comprou ${drawnCards.length}. Mão: ${player.hand.length}.`);
    if (player.hand.length > 1 && canCallUno[playerId]) { // Reset UNO se comprou
        canCallUno[playerId] = false; unoCalled[playerId] = false;
        if(playerId === 0 && unoBtn) unoBtn.classList.remove('can-press');
    }
    if (update && !gameOver) updateUI();
    return drawnCards;
}

/** Reembaralha a pilha de descarte. */
function reshuffleDiscardPile() {
    console.log(`Tentando reembaralhar descarte (${discardPile.length} cartas).`);
    if (discardPile.length <= 1) { console.warn("Não pode reembaralhar."); return false; }
    const topCard = discardPile.pop(); console.log("Mantendo topo:", topCard?.id);
    deck = [...discardPile]; discardPile = topCard ? [topCard] : []; shuffleDeck(deck);
    console.log(`Reembaralhado: Deck ${deck.length}, Descarte ${discardPile.length}.`);
    if(deck.length > 0 && deckPileElement) deckPileElement.style.display = 'block';
    setStatusMessage("Baralho reembaralhado."); return true;
}

/** Verifica se uma carta pode ser jogada. */
function isCardPlayable(cardToPlay) {
    if (gameOver || !cardToPlay) return false;
    if (mustDrawCards > 0) return (cardToPlay.value === 'wild4') || (cardToPlay.value === 'draw2' && currentValidValue === 'draw2');
    if (cardToPlay.type === 'wild') return true;
    return cardToPlay.color === currentValidColor || cardToPlay.value === currentValidValue;
}

/** Lida com a ação de jogar uma carta. */
function playCard(playerId, cardIndex) {
    if (gameOver || (playerId === 0 && botThinking) || playerId !== currentPlayerIndex) return;
    const player = players[playerId];
    if (!player || cardIndex < 0 || cardIndex >= player.hand.length || !player.hand[cardIndex]) { console.error(`Jogada inválida: P${playerId}, Idx ${cardIndex}`); return; }
    const card = player.hand[cardIndex];

    if (!isCardPlayable(card)) {
        setStatusMessage("Carta inválida!", true);
        const cardElem = (playerId===0)? playerHandElement?.querySelector(`[data-id="${card.id}"]`) : null;
        if(cardElem) { cardElem.style.animation = 'shake 0.5s ease-in-out'; setTimeout(() => cardElem.style.animation = '', 500); }
        return;
    }

    const playedCard = player.hand.splice(cardIndex, 1)[0];
    discardPile.push(playedCard);
    console.log(`P${playerId} jogou: ${playedCard.id}. Mão: ${player.hand.length}`);

    // Trata estado UNO
    if (player.hand.length === 1) { // Ficou com UMA
        console.log(`P${playerId} ficou com 1 carta (pode/precisa gritar UNO).`);
        canCallUno[playerId] = true; unoCalled[playerId] = false; // Pode, mas não gritou ainda
        if (playerId === 0 && unoBtn) { unoBtn.disabled = false; unoBtn.classList.add('can-press'); console.log("Botão UNO habilitado."); }
        else if (playerId === 1) { console.log("Bot 'gritou' UNO."); unoCalled[1] = true; /*canCallUno[1]=true;*/ setStatusMessage("Bot gritou UNO!"); } // Bot grita ao ficar com 1
    } else if (player.hand.length !== 1 && canCallUno[playerId]) { // Não tem mais 1 carta
         console.log(`P${playerId} saiu do estado UNO.`);
         canCallUno[playerId] = false; unoCalled[playerId] = false;
         if(playerId === 0 && unoBtn) { unoBtn.classList.remove('can-press'); unoBtn.disabled = true; }
    }

    updateUI(); // Mostra a carta jogada
    applyCardEffect(playedCard, playerId); // Aplica efeito e avança
}

/** Aplica os efeitos das cartas e controla o avanço do turno. */
function applyCardEffect(card, casterPlayerId) {
    if (gameOver || !card) return;
    let advance = true, skip = false;
    const targetIdx = (casterPlayerId + gameDirection + players.length) % players.length;
    const target = players[targetIdx]; const casterName = players[casterPlayerId]?.name;

    // 1. Atualiza cor/valor (Wilds depois)
    if(card.type !== 'wild') { currentValidColor = card.color; currentValidValue = card.value; }
    else currentValidValue = card.value; // Coringa define apenas valor inicialmente

    // 2. Efeitos
    switch (card.value) {
        case 'draw2': mustDrawCards += 2; playerMustPlayOrDraw = true; console.log(`${casterName}: +2! Acum ${mustDrawCards}`); setStatusMessage(`${casterName} +2! ${target?.name} compra ${mustDrawCards} ou joga.`); break;
        case 'wild4': mustDrawCards += 4; playerMustPlayOrDraw = true; advance = false; console.log(`${casterName}: +4! Acum ${mustDrawCards}`);
                      if (players[casterPlayerId].isBot) { botNextColorChoice = chooseBotColor(); handleColorChoice(botNextColorChoice, casterPlayerId); }
                      else { setStatusMessage("Você +4! Escolha cor."); promptColorChoice((c) => handleColorChoice(c, casterPlayerId)); } return;
        case 'skip': if(mustDrawCards === 0) { skip = true; console.log("Skip!"); setStatusMessage(`${casterName} Pular! ${target?.name} perde vez.`); } else console.log("Skip ignorado."); break;
        case 'reverse': if(mustDrawCards === 0) { if (players.length===2) { skip = true; console.log("Reverse (2p)"); setStatusMessage(`${casterName} Reverter! ${target?.name} perde vez.`);} else { gameDirection *= -1; console.log("Reverse"); setStatusMessage(`${casterName} Reverter! Direção: ${gameDirection===1?'hor':'anti-hor'}`);} } else console.log("Reverse ignorado."); break;
        case 'wild': if(mustDrawCards === 0) { advance = false; console.log("Wild!");
                      if (players[casterPlayerId].isBot) { botNextColorChoice = chooseBotColor(); handleColorChoice(botNextColorChoice, casterPlayerId); }
                      else { setStatusMessage("Coringa! Escolha cor."); promptColorChoice((c) => handleColorChoice(c, casterPlayerId)); } return;
                    } else { console.log("Wild ignorado."); currentValidValue = 'wild';} break; // Valor muda, cor não
        default: break; // Números
    }
    // 3. Avança?
    if(advance) { if(checkWinCondition(casterPlayerId)) endGame(casterPlayerId); else advanceTurn(true, skip); }
}

/** Processa a escolha de cor e avança o jogo. */
function handleColorChoice(color, chooserId) {
    if (gameOver || !color || !COLORS.includes(color)) { console.error("handleColorChoice: Inválido."); return; }
    console.log(`Cor: ${color} por ${chooserId}`); currentValidColor = color;
    botNextColorChoice = null; wildColorChoiceCallback = null; if(colorPickerModal) colorPickerModal.style.display = 'none';
    updateUI(); // Mostra cor
    const chooser = players[chooserId]; const prefix = chooser?.isBot ? "Bot escolheu" : "Você escolheu";
    let suffix = `. Vez do próximo.`; if (mustDrawCards > 0) { const next = (chooserId + gameDirection + players.length) % players.length; suffix = ` e ${players[next]?.name} compra ${mustDrawCards} ou +4!`; }
    setStatusMessage(`${prefix} ${color}${suffix}`);
    // Avança turno
    if(checkWinCondition(chooserId)) endGame(chooserId); else advanceTurn(true); // Checa penalidade do anterior ANTES de avançar
}

/** Mostra modal de escolha de cor para humano. */
function promptColorChoice(callback) {
    if (gameOver || wildColorChoiceCallback) return;
    wildColorChoiceCallback = callback; if(colorPickerModal) colorPickerModal.style.display = 'flex';
    if (drawCardBtn) drawCardBtn.disabled = true; if (unoBtn) unoBtn.disabled = true;
    playerHandElement?.querySelectorAll('.card').forEach(card => card.style.pointerEvents = 'none');
}

/** Processa a cor clicada no modal. */
function selectColor(color) { if (!gameOver && wildColorChoiceCallback) wildColorChoiceCallback(color); }

/** Passa o turno para o próximo jogador. */
function advanceTurn(checkPenalty = true, skipCardEffect = false) {
    if (gameOver) return;
    const prevPlayerId = currentPlayerIndex;
    console.log(`Avançando de P${prevPlayerId}. SkipCarta=${skipCardEffect}. CheckPen=${checkPenalty}. MustDraw=${mustDrawCards}. Dir=${gameDirection}`);
    playerZoneElement?.classList.remove('active-turn'); opponentZoneElement?.classList.remove('active-turn'); // Limpa indicador

    if (checkPenalty) checkUnoPenalty(prevPlayerId); // Checa UNO de quem acabou

    let nextIdx = (prevPlayerId + gameDirection + players.length) % players.length;
    if (skipCardEffect) { // Se foi carta Skip/Reverse(2p)
        console.log(`P${nextIdx} pulado por carta.`); nextIdx = (nextIdx + gameDirection + players.length) % players.length; // Pula de novo
        playerMustPlayOrDraw = false; mustDrawCards = 0; // Reset compra se pulou jogador por carta
    }

    currentPlayerIndex = nextIdx; const currentP = players[currentPlayerIndex];
    if (!currentP) { console.error("ERRO: Próximo jogador inválido!"); endGame(null, true); return; }
    console.log(`>>> Próximo: P${currentPlayerIndex} (${currentP.name}). Cartas: ${currentP.hand.length}.`);
    if (!gameOver) { if (currentPlayerIndex === 0) playerZoneElement?.classList.add('active-turn'); else opponentZoneElement?.classList.add('active-turn'); } // Define indicador

    // Lida com compra obrigatória para o jogador ATUAL
    playerMustPlayOrDraw = mustDrawCards > 0;
    if (playerMustPlayOrDraw) {
        const canCounter = currentP.hand.some(c => c && (c.value === 'wild4' || (c.value === 'draw2' && currentValidValue === 'draw2')));
        if (canCounter) { setStatusMessage(`Vez de ${currentP.name}! Jogue +${currentValidValue==='draw2'?2:4} ou compre ${mustDrawCards}!`); }
        else { // COMPRA FORÇADA + PULA
             setStatusMessage(`${currentP.name} compra ${mustDrawCards} e perde a vez.`); console.log(`P${currentPlayerIndex} compra ${mustDrawCards}.`);
             const drawnCount = drawCardFromDeck(currentPlayerIndex, mustDrawCards, false).length; const req = mustDrawCards; mustDrawCards = 0; playerMustPlayOrDraw = false;
             if (!gameOver) updateUI(); if (gameOver) return;
             console.log(`Passando vez P${currentPlayerIndex} (comprou ${drawnCount}/${req}).`);
             advanceTurn(false, true); return; // PULA QUEM COMPROU
        }
    } else if (!skipCardEffect) { setStatusMessage(`É a vez de ${currentP.name}!`); } // Turno normal

    updateUI(); // Atualiza geral ANTES de liberar/bot

    // Prepara próximo turno
    if (currentP.isBot) { botThinking = true; triggerBotTurn(); } // Chama bot
    else { botThinking = false; updateUI(); } // Libera humano (updateUI habilita botões)
}

/** Verifica condição de vitória. */
function checkWinCondition(playerId) {
    if (gameOver) return true; const p = players[playerId]; if (!p) return false;
    if (p.hand.length === 0) {
        if (unoCalled[playerId]) { console.log(`P${playerId} VENCEU!`); return true; } // UNO OK
        else if (canCallUno[playerId]) { console.log(`P${playerId} esqueceu UNO!`); setStatusMessage(`${p.name} esqueceu UNO! +2.`, true); drawCardFromDeck(playerId, 2, true); return false; } // Penalidade
        else { console.log(`P${playerId} venceu (sem estado UNO?).`); return true; } // Vitória sem precisar UNO?
    } return false; // Não zerou
}

/** Finaliza o jogo. */
 function endGame(winnerId, isDraw = false) {
     if (gameOver) return; gameOver = true; botThinking = false;
     console.log("================ FIM DE JOGO ================");
     playerZoneElement?.classList.remove('active-turn', 'has-uno'); opponentZoneElement?.classList.remove('active-turn', 'has-uno');
     // Desabilita interações
     if(drawCardBtn) drawCardBtn.disabled = true; if(unoBtn) { unoBtn.disabled = true; unoBtn.classList.remove('can-press'); }
     playerHandElement?.querySelectorAll('.card').forEach(card => { card.style.pointerEvents = 'none'; card.classList.remove('card--playable'); });
     if(deckPileElement) deckPileElement.style.cursor = 'default'; if(colorPickerModal) colorPickerModal.style.display = 'none';
     // Define mensagem final
     let finalMsg = "Fim de Jogo!";
     if (isDraw) { finalMsg = "EMPATE! 🏳️"; console.log("Empate."); }
     else if (winnerId !== null && players[winnerId]) { finalMsg = `🎉 ${players[winnerId].name.toUpperCase()} VENCEU! 🎉`; console.log(`Vencedor: ${players[winnerId].name}`); if(winnerId === 0 && playerHandElement) playerHandElement.innerHTML = ''; else if(opponentHandElement) opponentHandElement.setAttribute('data-count', '0'); }
     else { console.log("Fim sem vencedor claro."); }
     setStatusMessage(finalMsg, false, isDraw || (winnerId !== null)); // Usa isWinner para destacar
     // Adiciona botão Reiniciar
     let restartBtn = gameStatusElement?.querySelector('.btn--restart');
     if (gameStatusElement && !restartBtn) { restartBtn = document.createElement('button'); restartBtn.textContent = 'Jogar Novamente'; restartBtn.className = 'btn btn--restart'; gameStatusElement.appendChild(document.createElement('br')); gameStatusElement.appendChild(restartBtn); }
     if(restartBtn) restartBtn.onclick = startGame;
 }

/** Atualiza toda a interface. */
function updateUI() {
    if (gameOver || !players || players.length < 2) return;
    renderPlayerHand(); renderOpponentHand(); renderDiscardPile(); renderDeckPile(); // Renderiza áreas

    // Atualiza estado visual (UNO badge, botões, destaque)
    if (playerZoneElement) playerZoneElement.classList.toggle('has-uno', players[0]?.hand.length === 1 && unoCalled[0]);
    if (opponentZoneElement) opponentZoneElement.classList.toggle('has-uno', players[1]?.hand.length === 1 && unoCalled[1]);
    if (currentPlayerIndex === 0 && !botThinking) { // Se for vez do humano
        const deckCanBeUsed = deck.length > 0 || discardPile.length > 1; // Pode comprar ou reembaralhar
        if (drawCardBtn) drawCardBtn.disabled = playerMustPlayOrDraw || !deckCanBeUsed;
        if (unoBtn) { unoBtn.disabled = !(canCallUno[0] && !unoCalled[0]); unoBtn.classList.toggle('can-press', !unoBtn.disabled); }
        highlightPlayableCards();
    } else { // Desabilita se não for vez do humano
        if (drawCardBtn) drawCardBtn.disabled = true;
        if (unoBtn) { unoBtn.disabled = true; unoBtn.classList.remove('can-press'); }
        playerHandElement?.querySelectorAll('.card--playable').forEach(c => c.classList.remove('card--playable'));
    }
    if (!wildColorChoiceCallback && colorPickerModal) colorPickerModal.style.display = 'none'; // Fecha modal
}

/** Renderiza a mão do jogador humano. */
function renderPlayerHand() {
    if (!playerHandElement || !players?.[0]) return; const hand = players[0].hand;
    const frag = document.createDocumentFragment(); hand.forEach(c => c && frag.appendChild(createCardElement(c, c.id, true)));
    playerHandElement.innerHTML = ''; playerHandElement.appendChild(frag);
}

/** Renderiza a contagem do oponente. */
function renderOpponentHand() { if (opponentHandElement && players?.[1]) opponentHandElement.setAttribute('data-count', Math.max(0, players[1].hand.length)); }

/** Renderiza a pilha de descarte. */
function renderDiscardPile() {
    if (!discardPileElement) return; discardPileElement.innerHTML = ''; if (discardPile.length === 0) { discardPileElement.innerHTML = '<div class="card card--placeholder"><span>Descarte</span></div>'; return; }
    const topCard = discardPile[discardPile.length - 1]; if (!topCard) return;
    const topElem = createCardElement(topCard, topCard.id + '-discard', false); topElem.style.cssText = `position:relative; z-index:1;`; // Posição relativa para badge
    if (currentValidColor && COLORS.includes(currentValidColor)) topElem.style.cssText += `box-shadow: 0 0 10px 3px var(--uno-${currentValidColor}), 3px 3px 5px rgba(0,0,0,.3); border-color: var(--uno-${currentValidColor}); border-width: 2px;`; // Brilho
    if (mustDrawCards > 0) { const b = document.createElement('div'); b.className='draw-count-badge'; b.textContent=`+${mustDrawCards}`; topElem.appendChild(b); } // Badge +X
    const stackFrag = document.createDocumentFragment(); for (let i = 1; i <= Math.min(discardPile.length - 1, 2); i++) { // Efeito pilha
        const below = discardPile[discardPile.length-1-i]; if(!below) continue; const bElem = createCardElement(below, below.id + '-stack-' + i, false);
        bElem.style.cssText = `position:absolute; z-index:${-i}; opacity:${1-(i*.3)}; filter:blur(${i*.5}px); transform:translateX(${i*2.5}px) translateY(${i*2.5}px) rotate(${(i%2===0?-1:1)*i*4}deg);`;
        stackFrag.appendChild(bElem);
    }
    discardPileElement.appendChild(stackFrag); discardPileElement.appendChild(topElem); // Pilha primeiro, topo depois
}

/** Renderiza a pilha de compra (baralho). */
function renderDeckPile() {
    if (!deckPileElement) return; deckPileElement.innerHTML = '';
    if (deck.length > 0) {
        const back = document.createElement('div'); back.className='card card--back'; deckPileElement.appendChild(back); deckPileElement.style.display='block';
        const canDraw = currentPlayerIndex === 0 && !botThinking && !playerMustPlayOrDraw; deckPileElement.style.cursor = canDraw?'pointer':'default'; deckPileElement.title = canDraw?'Comprar Carta':'Baralho';
    } else {
        const canReshuffle = discardPile.length > 1; if (canReshuffle) { deckPileElement.innerHTML = '<div class="card card--placeholder card--reshuffle"><span>Reembaralhar</span></div>'; deckPileElement.style.display='block'; const clickReshuf = currentPlayerIndex === 0 && !botThinking; deckPileElement.style.cursor = clickReshuf?'pointer':'default'; deckPileElement.title = clickReshuf?'Reembaralhar e Comprar':'Baralho Vazio'; }
        else { deckPileElement.style.display='none'; } console.log("Render deck vazio.");
    }
}

/** Cria o elemento HTML para uma carta. */
function createCardElement(card, elementDomId, isPlayerCard = true) {
    if (!card) { console.error("createCardElement: Carta inválida."); return document.createComment("Inv"); }
    const cardElem = document.createElement('div'); cardElem.className = 'card';
    cardElem.dataset.id = card.id; cardElem.id = `card-dom-${elementDomId}`;
    const valSpan = document.createElement('span'); valSpan.className = 'value'; // Span sempre presente
    if (card.color === 'special') { cardElem.classList.add('card--special', `card--${card.value}`); } // Wilds
    else { // Coloridas
        cardElem.classList.add(`card--${card.color}`);
        if (isNaN(parseInt(card.value))) cardElem.classList.add('card--special', `card--${card.value}`); // Ações
        else valSpan.textContent = card.value; // Números
    } cardElem.appendChild(valSpan);

    // Listener só para cartas na MÃO do jogador 0
    if (isPlayerCard && playerHandElement && players?.[0]?.hand.some(c => c && c.id === card.id)) {
        cardElem.addEventListener('click', () => {
            if (!gameOver && currentPlayerIndex === 0 && !botThinking) {
                const cId = cardElem.dataset.id; const idx = players[0].hand.findIndex(hCard => hCard && hCard.id === cId);
                if (idx !== -1) { console.log(`Click: ${cId} (idx ${idx})`); playCard(0, idx); }
                else console.error(`Click Erro: ${cId} não na mão.`);
            } else { /* Informa erro no clique */ if(botThinking)setStatusMessage("Aguarde Bot", true); else if(currentPlayerIndex!==0)setStatusMessage("Não é sua vez!", true); else if(gameOver)setStatusMessage("Fim!", true); }
        });
        cardElem.style.cursor = 'pointer';
    } else { cardElem.style.cursor = 'default'; }
    return cardElem;
}

/** Destaca cartas jogáveis na mão humana. */
function highlightPlayableCards() {
    if (gameOver || currentPlayerIndex !== 0 || !playerHandElement || !players?.[0]) return;
    playerHandElement.querySelectorAll('.card').forEach(elem => {
        const id = elem.dataset.id; const cardData = players[0].hand.find(c => c && c.id === id);
        const playable = cardData && isCardPlayable(cardData);
        elem.classList.toggle('card--playable', playable); elem.style.cursor = playable ? 'pointer' : 'default';
    });
}

/** Define a mensagem de status do jogo. */
function setStatusMessage(msg, isErr = false, isWin = false) {
    if (!gameStatusElement) return; const btn = gameStatusElement.querySelector('.btn--restart'), br = gameStatusElement.querySelector('br');
    Array.from(gameStatusElement.childNodes).forEach(n => { if (n.nodeType === 3) gameStatusElement.removeChild(n); }); // Limpa só texto
    gameStatusElement.insertBefore(document.createTextNode(msg), gameStatusElement.firstChild); // Insere msg
    gameStatusElement.className = 'game-status'; // Reseta classes
    if(isWin) gameStatusElement.classList.add('winner-message'); else if(isErr) gameStatusElement.classList.add('error-message');
    else if(msg.includes("Vez de")) gameStatusElement.classList.add('player-turn'); else if(msg.includes("UNO")) gameStatusElement.classList.add('uno-alert');
    if (br && btn) { gameStatusElement.appendChild(br); gameStatusElement.appendChild(btn); } // Readiciona botão/br
    console.log("Status:", msg);
}

// ===== Lógica da IA (Bot) =====
/** Ativa o turno do bot. */
function triggerBotTurn() {
    if (gameOver || currentPlayerIndex !== 1 || !players[1]?.isBot) { botThinking = false; console.warn("Trigger Bot cancelado."); if (!gameOver && currentPlayerIndex === 0) updateUI(); return; }
    console.log("Bot pensando..."); setStatusMessage("Bot está pensando...");
    setTimeout(() => { if (!gameOver && currentPlayerIndex === 1 && players[1]?.isBot) executeBotLogic(); else { console.log("Bot não joga: estado mudou."); botThinking = false; if (!gameOver && currentPlayerIndex === 0) updateUI(); } }, BOT_TURN_DELAY_MS);
}

/** Executa a lógica de decisão e jogada do bot. */
function executeBotLogic() {
    if (gameOver || currentPlayerIndex !== 1 || !players[1]?.isBot) { botThinking = false; return; }
    console.log("--- Bot Logic Start ---"); const bot = players[1]; const playable = [], wilds = [], wild4s = [], draw2s = [];
    bot.hand.forEach((card, index) => { if (card && isCardPlayable(card)) { const d = {card, index}; playable.push(d); if(card.value==='wild') wilds.push(d); else if(card.value==='wild4') wild4s.push(d); else if(card.value==='draw2') draw2s.push(d);}}); // Mapeia jogáveis

    if (playerMustPlayOrDraw) { // Ação Obrigatória (+2/+4)?
        if (wild4s.length > 0) { console.log("Bot: +4!"); botNextColorChoice = chooseBotColor(); playCard(1, wild4s[0].index); botThinking = false; return; }
        if (draw2s.length > 0) { console.log("Bot: +2!"); playCard(1, draw2s[0].index); botThinking = false; return; }
        console.log("Bot: Compra forçada (tratada por advanceTurn)."); return; // Sai, advanceTurn força
    }
    if (playable.length > 0) { // Jogar
        let choice = null; const nonWild = playable.filter(d => d.card.type !== 'wild'); const matchColor = nonWild.filter(d => d.card.color === currentValidColor); const matchValue = nonWild.filter(d => d.card.value === currentValidValue && d.card.color !== currentValidColor); const actions = nonWild.filter(d => ['skip','reverse','draw2'].includes(d.card.value)); const numbers = nonWild.filter(d => !isNaN(parseInt(d.card.value)));
        // --- Estratégia ---
        const aSameC = actions.find(d => d.card.color === currentValidColor), aSameV = actions.find(d => d.card.value === currentValidValue);
        if(aSameC) choice = aSameC; else if(matchColor.length > 0) choice = matchColor[Math.floor(Math.random()*matchColor.length)]; else if(aSameV) choice = aSameV; else if(matchValue.length > 0) choice = matchValue[Math.floor(Math.random()*matchValue.length)]; else if(actions.length > 0 && (players[0].hand.length <= 3 || nonWild.length === actions.length)) choice = actions[Math.floor(Math.random()*actions.length)]; else if(numbers.length > 0) choice = numbers[Math.floor(Math.random()*numbers.length)]; else if(wilds.length > 0 && (wild4s.length === 0 || bot.hand.length > 2 || players[0].hand.length > 4)) { choice = wilds[0]; botNextColorChoice = chooseBotColor(); } else if(wild4s.length > 0) { choice = wild4s[0]; botNextColorChoice = chooseBotColor(); } else if(wilds.length > 0) { choice = wilds[0]; botNextColorChoice = chooseBotColor(); } else choice = playable[0]; // Fallback
        // --- Fim Estratégia ---
        if (!choice) { console.error("Bot: Falha lógica escolha!"); botThinking = false; return; }
        console.log(`Bot joga: ${choice.card.id} (idx ${choice.index})`); playCard(1, choice.index); botThinking = false;
    } else { // Comprar
        console.log("Bot comprando..."); setStatusMessage("Bot comprando..."); const drawn = drawCardFromDeck(1, 1, true);
        if (drawn.length > 0 && isCardPlayable(drawn[0])) { console.log(`Bot joga comprada: ${drawn[0].id}`);
             setTimeout(() => { if(gameOver || currentPlayerIndex !== 1) return; const idx = bot.hand.findIndex(c => c && c.id === drawn[0].id); if (idx !== -1) { if (bot.hand.length===1) {console.log("Bot UNO c/ comprada."); unoCalled[1]=true; canCallUno[1]=true; setStatusMessage("Bot UNO!");} if (drawn[0].type === 'wild') botNextColorChoice = chooseBotColor(); setStatusMessage("Bot jogou a comprada!"); playCard(1, idx); } else {console.error("Bot: Comprada sumiu?"); advanceTurn();} botThinking = false; }, 750);
        } else { console.log("Bot comprou e passa."); setStatusMessage("Bot comprou e passou."); botThinking = false; advanceTurn(true); } // Passa, checa penalidade
    } console.log("--- Bot Logic End ---");
}

/** IA do Bot para escolher a cor. */
function chooseBotColor() { const hand = players[1]?.hand; if (!hand || hand.length === 0) return COLORS[Math.floor(Math.random() * COLORS.length)]; const counts = { red: 0, blue: 0, green: 0, yellow: 0 }; hand.forEach(card => { if (COLORS.includes(card?.color)) counts[card.color]++; }); let best = '', max = -1; const tied = []; for (const c in counts) { if (counts[c] > max) { max = counts[c]; tied.length = 0; tied.push(c); } else if (counts[c] === max) tied.push(c); } if (max <= 0) best = COLORS[Math.floor(Math.random() * COLORS.length)]; else if (tied.length === 1) best = tied[0]; else best = tied[Math.floor(Math.random() * tied.length)]; console.log(`Bot escolheu cor: ${best}`); return best; }

// ===== Funções de Interação e Verificação =====
/** Clique no baralho/botão comprar. */
function handleDrawClick() {
    if (gameOver || currentPlayerIndex !== 0 || botThinking) return;
    if (playerMustPlayOrDraw) { console.log(`Jogador compra ${mustDrawCards} (obrigatório).`); setStatusMessage(`Você compra ${mustDrawCards} e perde a vez.`); drawCardFromDeck(0, mustDrawCards, true); const c = mustDrawCards; mustDrawCards=0; playerMustPlayOrDraw=false; advanceTurn(false, true); } // Pula vez
    else if (deck.length > 0) { console.log("Jogador compra 1."); drawCardFromDeck(0, 1, true); setStatusMessage("Comprou. Vez acabou."); advanceTurn(true); } // Compra normal
    else if (discardPile.length > 1) { console.log("Clicou para reembaralhar."); setStatusMessage("Reembaralhando..."); if(reshuffleDiscardPile()){updateUI(); setStatusMessage("Reembaralhado. Clique para comprar.");} else setStatusMessage("Falha ao reembaralhar.", true);} // Tenta reembaralhar
    else { console.log("Sem cartas."); setStatusMessage("Sem cartas!", true); } // Impossível
}

/** Clique no botão UNO. */
function handleUnoClick() { /* TODO: Cancelar timer penalidade */ if (gameOver || currentPlayerIndex !== 0 || botThinking || !unoBtn) return; if (canCallUno[0] && !unoCalled[0]) { console.log("Jogador UNO!"); setStatusMessage("Você gritou UNO!"); unoCalled[0] = true; unoBtn.disabled = true; unoBtn.classList.remove('can-press'); } else if (!canCallUno[0]) setStatusMessage("Não pode UNO agora.", true); else if (unoCalled[0]) setStatusMessage("Já gritou UNO!", true); }

/** Verifica penalidade UNO. */
function checkUnoPenalty(playerId, forceCheck = false) { if (gameOver || !players?.[playerId]) return; const p=players[playerId]; if (canCallUno[playerId] && !unoCalled[playerId] && (forceCheck || currentPlayerIndex !== playerId)) { console.warn(`${p.name} esqueceu UNO!`); setStatusMessage(`${p.name} esqueceu UNO! +2.`, true); drawCardFromDeck(playerId, 2, true); } }

// ===== Event Listeners =====
if (deckPileElement) deckPileElement.addEventListener('click', handleDrawClick); else console.error("Erro: #deck-pile");
if (drawCardBtn) drawCardBtn.addEventListener('click', handleDrawClick); else console.error("Erro: #draw-card-btn"); // Listener para botão
if (unoBtn) unoBtn.addEventListener('click', handleUnoClick); else console.error("Erro: #uno-btn");
colorButtons.forEach(b => b.addEventListener('click', () => { const c=b.dataset.color; if(c) selectColor(c); }));
if (currentYearElement) currentYearElement.textContent = new Date().getFullYear();

// ===== Inicialização =====
window.addEventListener('error', (e) => { console.error('ERRO GLOBAL:', e.message, e.filename, e.lineno); setStatusMessage("Erro inesperado!", true); });
document.addEventListener('DOMContentLoaded', startGame);