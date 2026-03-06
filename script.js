let questions = [];           // questions used in game
let allQuestions = [];        // all existing questions in firebase
let categories = {};          // numeric ID → category name
let questionsByCategory = {}; // category name → array of questions

function loadQuestionsFromFile() {
    fetch('README.md')
        .then(response => response.text())
        .then(fileContent => {

            // Clear all
            questions = [];
            allQuestions = [];
            categories = {};
            questionsByCategory = {};

            const discoveredCategories = [];

            // Find questions block
            const questionsBlock = fileContent.match(/### INÍCIO PERGUNTAS\n([\s\S]*?)### FIM PERGUNTAS/);

            if (!questionsBlock || !questionsBlock[1]) {
                console.error("Bloco de perguntas não encontrado no README.md");
                return;
            }

            const blockContent = questionsBlock[1].trim();

            // Remove table header and empty rows
            const lines = blockContent
                .split('\n')
                .filter(line => line.trim() !== '')
                .slice(1); // to skip header

            // Recover questions
            lines.forEach(line => {
                const [category, question, options, answer, statusStr] = line.split('|').map(item => item.trim());

                const optionsArray = options.split(';').map(o => o.trim());
                const statusBool = statusStr === "Ok";

                const q = {
                    category,
                    question,
                    options: optionsArray,
                    answer,
                    status: statusBool
                };

                allQuestions.push(q);

                // Only questions with true status are used in game
                if (q.status) {
                    // Collect category names for valid questions
                    if (!discoveredCategories.includes(category)) {
                        discoveredCategories.push(category);
                    }

                    questions.push(q);

                    // Group questions by category name
                    if (!questionsByCategory[category]) {
                        questionsByCategory[category] = [];
                    }
                    questionsByCategory[category].push(q);
                }
            });

            // Build categories map with numeric keys
            // Start from 1 (string keys: "1", "2", ...)
            discoveredCategories.sort();
            discoveredCategories.forEach((cat, index) => {
                categories[(index + 1).toString()] = cat;
            });
        })
        .catch(error => console.error("Erro ao carregar perguntas:", error));
}

async function loadQuestionsFromFirebase() {
    db.collection('questions').onSnapshot(snapshot => {
        questions = [];
        allQuestions = [];
        categories = {};
        questionsByCategory = {};
        const discoveredCategories = [];

        snapshot.forEach(doc => {
            const data = doc.data();

            const categoryName = data.category;

            // Collect category names and avoid duplicates
            if (!discoveredCategories.includes(categoryName)) {
                discoveredCategories.push(categoryName);
            }
            
            const q = {
                id: doc.id,
                category: categoryName,
                question: data.question,
                options: data.options,
                answer: data.answer,
                status: data.status
            };

            allQuestions.push(q);

            if(q.status) {
                questions.push(q);

                // Group questions by category name
                if (!questionsByCategory[categoryName]) {
                    questionsByCategory[categoryName] = [];
                }
                questionsByCategory[categoryName].push(q);
            }
        });

        // Build categories map with numeric keys
        // Start from 1 (string keys: "1", "2", ...)
        categories = {};
        discoveredCategories.sort();
        discoveredCategories.forEach((cat, index) => {
            categories[(index + 1).toString()] = cat;
        });
    });
}

// loadQuestionsFromFile();
loadQuestionsFromFirebase();

let currentQuestionIndex = 0;
let score = 0;
let totalQuestions = 5;
let currentInputIndex = 0;
let gameStarted = false;

// DOM elements
const questionElement = document.getElementById("question");
const optionsContainer = document.getElementById("options-container");
const nextButton = document.getElementById("next-button");
const resultContainer = document.getElementById("result-container");
const scoreElement = document.getElementById("score");
const startButton = document.getElementById("start-button");
const gameContainer = document.getElementById("game-container");
const questionCountSelect = document.getElementById("question-count-control");
const questionCountDiv = document.getElementById("question-count-div");
const categorySelect = document.getElementById("question-category-control");
const questionContainer = document.getElementById("question");
const scoreContainer = document.getElementById("result-container");
const categorySelector = document.getElementById("question-category-control");
const modeSelector = document.getElementById("mode-control");
const footer = document.getElementById("footer");

// update year
document.getElementById('current-year').textContent = new Date().getFullYear();

// create element
const listContainer = document.createElement("div");
listContainer.id = "list-container";
document.body.insertBefore(listContainer, document.getElementById("game-container"));

// function to generate a vector of random numbers between 0 and number of questions - 1
function generateShuffledIndexes(size) {
    const indexes = Array.from({ length: size }, (_, i) => i); // [0, 1, 2, ..., size-1]

    for (let i = indexes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indexes[i], indexes[j]] = [indexes[j], indexes[i]];
    }

    return indexes;
}

function selectOption(element, option) {
    const currentQuestion = gameQuestions[currentQuestionIndex];
    const isCorrect = option === currentQuestion.answer;

    if (isCorrect) {
        element.classList.add("correct");
        score++;
    } else {
        element.classList.add("incorrect");
    }

    Array.from(optionsContainer.children).forEach(child => {
        child.onclick = null;
        if (child.textContent === currentQuestion.answer) {
            child.classList.add("correct");
        }
    });

    nextButton.disabled = false;
}

function loadQuestion() {
    const currentQuestion = gameQuestions[currentQuestionIndex];
    questionContainer.textContent = (currentQuestionIndex + 1).toString() + ') ' + currentQuestion.question;
    optionsContainer.innerHTML = "";
    nextButton.disabled = true;

    // shuffle indexes
    const shuffledOptionsIndexes = generateShuffledIndexes(currentQuestion.options.length);
    const shuffledOptions = [];

    // fill array
    for (let i = 0; i < shuffledOptionsIndexes.length; i++) {
        shuffledOptions[i] = currentQuestion.options[shuffledOptionsIndexes[i]];
    }

    // show shuffled
    shuffledOptions.forEach(option => {
        const optionElement = document.createElement("div");
        optionElement.classList.add("option");
        optionElement.textContent = option;
        optionElement.onclick = () => selectOption(optionElement, option);
        optionsContainer.appendChild(optionElement);
    });
}

function showResult() {
    const totalAnsweredQuestions = gameQuestions.length;
    questionContainer.textContent = "Fim do jogo!";
    optionsContainer.innerHTML = "";
    nextButton.style.display = "none";
    scoreContainer.style.display = "block";
    scoreElement.textContent = `Você acertou ${score} de ${totalAnsweredQuestions} perguntas!`;
}

function nextQuestion() {
    currentQuestionIndex++;

    if (currentQuestionIndex < gameQuestions.length) {
        loadQuestion();
    } else {
        showResult();
    }
}

function startGame() {
    const selectedCategory = categorySelector.value;
    let filteredQuestions;

    if (selectedCategory === "0") {
        // all categories, shuffle per question game size
        const shuffledIndexes = generateShuffledIndexes(questions.length);
        const totalQuestions = parseInt(questionCountSelect.value, 10);
        const selectedIndexes = shuffledIndexes.slice(0, totalQuestions);
        filteredQuestions = selectedIndexes.map(index => questions[index]);
    } else {
        // questions must be filtered by choosen category
        const categoryName = categories[selectedCategory];
        filteredQuestions = questions.filter(q => q.category === categoryName);

        // shuffle all questions for that category
        const shuffledIndexes = generateShuffledIndexes(filteredQuestions.length);
        filteredQuestions = shuffledIndexes.map(index => filteredQuestions[index]);
    }

    // config game questions
    nextButton.style.display = "";
    gameQuestions = filteredQuestions;
    currentQuestionIndex = 0;
    loadQuestion();
}

startButton.addEventListener("click", () => {
    totalQuestions = parseInt(questionCountSelect.value); 
    currentQuestionIndex = 0; 
    score = 0; 
    scoreContainer.style.display = "none"; 
    gameContainer.style.display = "block"; 
    startButton.style.backgroundColor = '#f44336';
    startButton.style.color = 'white'; 
    startButton.textContent = 'Recomeçar';
    gameStarted = true;
    document.getElementById('footer').style.display = "none";
    document.getElementById('easter-egg').style.display = "none";
    document.getElementById('easter-egg-input').style.display = "none";

    startGame();
});

nextButton.addEventListener("click", nextQuestion);

categorySelector.addEventListener("change", () => {
    const selectedCategory = categorySelector.value;

    if (selectedCategory === "0") {
        // activate number of questions selector
        questionCountSelect.disabled = false;
    } else {
        // disable number of questions selector
        questionCountSelect.disabled = true;
    }
});

function activateEasterEgg() {
    document.getElementById("easter-egg").style.display = "block";
    document.getElementById("easter-egg-input").style.display = "none";
    document.getElementById("footer").style.display = "none";
    alert("Easter Egg Desbloqueado! Veja os autores do projeto.");
}

// Function to verify easter egg code
function checkEasterEggCode() {
    const codeInput = document.getElementById("easter-egg-code");
    if (codeInput.value === "IG" || codeInput.value === "ig") {
        activateEasterEgg();
    } else {
        alert("Código incorreto! Tente novamente.");
    }
    codeInput.value = ""; // Clear input field
}

// Add double click event to show hidden code field
let touchTimeout;
document.addEventListener("touchstart", () => {
    if (!gameStarted) {
        if (touchTimeout) {
            // Double touch detected
            clearTimeout(touchTimeout);
            touchTimeout = null;

            // show input
            const codeContainer = document.getElementById("easter-egg-input");
            codeContainer.style.display = "block";
        } else {
            // First touch
            touchTimeout = setTimeout(() => {
                touchTimeout = null; // Timeout reset
            }, 300);
        }
    }
});

function bindAdminActionEvents() {
    // Edit buttons
    document.querySelectorAll(".edit-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.dataset.id;
            const q = allQuestions.find(x => x.id === id);
            if (q) openEditModal(q);
        });
    });

    // Delete buttons
    document.querySelectorAll(".delete-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.dataset.id;
            questionToDelete = id;
            M.Modal.getInstance(deleteModal).open();
        });
    });
}

function showQuestionList() {
    listContainer.innerHTML = "";
    const selectedCategory = categorySelector.value;
    let filteredQuestions;

    if (selectedCategory === "0") {
        filteredQuestions = allQuestions;
    } else {
        const categoryName = categories[selectedCategory];
        filteredQuestions = allQuestions.filter(q => q.category === categoryName);
    }

    const listElement = document.createElement("ul");
    listElement.classList.add("question-list");

    filteredQuestions.forEach(q => {
        const listItem = document.createElement("li");
        listItem.classList.add("question-item");

        // Base content
        let content = `
            <strong>${q.question}</strong><br>
            Resposta correta: ${q.answer}
        `;

        if (q.status) {
            content += `
                <div class="status">
                    <img src="assets/store/ok.png"
                        style="width:22px; height:22px; cursor:pointer; margin-right:10px;"> 
                </div>
            `;
        } else {
            content += `
                <div class="status">
                    <img src="assets/store/nok.png"
                        style="width:22px; height:22px; cursor:pointer; margin-right:10px;"> 
                </div>
            `;
        }

        // If ADMIN, add buttons
        if (checkIfAdmin()) {
            content += `
                <div class="admin-actions">
                    <img src="assets/store/edit.png" 
                        class="action-btn edit-btn"
                        data-id="${q.id}" 
                        style="width:22px; height:22px; cursor:pointer; margin-right:10px;">

                    <img src="assets/store/delete.png" 
                        class="action-btn delete-btn"
                        data-id="${q.id}" 
                        style="width:22px; height:22px; cursor:pointer;">
                </div>
            `;
        }
                
        listItem.innerHTML = content;
        listElement.appendChild(listItem);
    });

    listContainer.appendChild(listElement);

    // Bind Edit/Delete events
    bindAdminActionEvents();
}

categorySelect.addEventListener("change", () => {    
    if (categorySelect.value === "0") {
        questionCountDiv.style.display = "block";
    } else {
        questionCountDiv.style.display = "none";
    }
});

modeSelector.addEventListener("change", () => {
    if (modeSelector.value === "1") {
        gameContainer.style.display = "none";
        listContainer.style.display = "block";
        footer.style.position = "relative";
        showQuestionList();
    } else {
        gameContainer.style.display = "block";
        listContainer.style.display = "none";
        footer.style.position = "fixed";
    }
});