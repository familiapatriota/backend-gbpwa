document.addEventListener('DOMContentLoaded', () => {
    // Verifica se o Firebase está disponível
    if (typeof firebase === 'undefined') {
        console.error("Firebase não está carregado.");
        return;
    }

    const auth = firebase.auth();
    const db = firebase.firestore();

    // --- LÓGICA DE NAVEGAÇÃO ENTRE TELAS ---
    const page = window.location.pathname;

    if (page.includes('login.html')) {
        setupLoginPage();
    } else if (page.includes('index.html')) {
        setupMainPage();
    }

    // --- FUNÇÕES DE SETUP DAS PÁGINAS ---

    function setupLoginPage() {
        const loginForm = document.getElementById('login-form');
        const signupForm = document.getElementById('signup-form');
        const showSignupLink = document.getElementById('show-signup');
        const showLoginLink = document.getElementById('show-login');

        showSignupLink.addEventListener('click', () => {
            loginForm.style.display = 'none';
            signupForm.style.display = 'block';
        });

        showLoginLink.addEventListener('click', () => {
            signupForm.style.display = 'none';
            loginForm.style.display = 'block';
        });

        // Event Listeners para os botões
        document.getElementById('btn-login').addEventListener('click', handleLogin);
        document.getElementById('btn-signup').addEventListener('click', handleSignup);
    }

    function setupMainPage() {
        auth.onAuthStateChanged(user => {
            if (user) {
                document.getElementById('user-info').textContent = `Olá, ${user.email}`;
                fetchAndDisplayInvoices(user);
            } else {
                window.location.replace('login.html');
            }
        });

        document.getElementById('btn-logout').addEventListener('click', () => {
            auth.signOut();
        });
    }

    // --- FUNÇÕES DE MANIPULAÇÃO (HANDLERS) ---

    async function handleLogin() {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const errorDiv = document.getElementById('login-error');
        
        clearError(errorDiv);

        if (!email || !password) {
            showError(errorDiv, "Por favor, preencha todos os campos.");
            return;
        }

        toggleLoading(true);
        try {
            await auth.signInWithEmailAndPassword(email, password);
            window.location.assign('index.html');
        } catch (error) {
            console.error("Erro no login:", error);
            showError(errorDiv, getFriendlyErrorMessage(error.code));
        } finally {
            toggleLoading(false);
        }
    }

    async function handleSignup() {
        const name = document.getElementById('signup-name').value;
        const cpf = document.getElementById('signup-cpf').value;
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;
        const errorDiv = document.getElementById('signup-error');

        clearError(errorDiv);

        if (!name || !cpf || !email || !password) {
            showError(errorDiv, "Por favor, preencha todos os campos.");
            return;
        }
        if (password.length < 6) {
            showError(errorDiv, "A senha deve ter no mínimo 6 caracteres.");
            return;
        }

        toggleLoading(true);
        try {
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            
            await db.collection('users').doc(user.uid).set({
                name: name,
                cpf: cpf.replace(/\D/g, ''), // Salva apenas números
                email: email
            });

            window.location.assign('index.html');
        } catch (error) {
            // Log detalhado para depuração
            console.error("Erro detalhado no cadastro:", {
                code: error.code,
                message: error.message
            });
            showError(errorDiv, getFriendlyErrorMessage(error.code));
        } finally {
            toggleLoading(false);
        }
    }

    async function fetchAndDisplayInvoices(user) {
        toggleMensalidadesLoading(true);
        const errorContainer = document.getElementById('error-container');
        errorContainer.style.display = 'none';

        try {
            const idToken = await user.getIdToken(true);
            const response = await fetch('/api/mensalidades', {
                headers: { 'Authorization': `Bearer ${idToken}` }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || `Erro ${response.status}`);
            }

            const mensalidades = await response.json();
            renderMensalidades(mensalidades);

        } catch (error) {
            console.error("Erro ao buscar mensalidades:", error);
            errorContainer.textContent = `Não foi possível buscar as mensalidades: ${error.message}`;
            errorContainer.style.display = 'block';
        } finally {
            toggleMensalidadesLoading(false);
        }
    }

    // --- FUNÇÕES DE RENDERIZAÇÃO E UTILITÁRIAS ---

    function renderMensalidades(mensalidades) {
        const containers = {
            vencidas: document.getElementById('vencidas-container'),
            apagar: document.getElementById('apagar-container'),
            pagas: document.getElementById('pagas-container')
        };

        Object.values(containers).forEach(c => c.innerHTML = '');

        if (mensalidades.length === 0) {
            document.getElementById('no-mensalidades').style.display = 'block';
            return;
        }

        const hoje = new Date().toISOString().split('T')[0]; // Formato YYYY-MM-DD

        mensalidades.forEach(inv => {
            let status = '';
            let container = null;

            if (inv.status === 'PAID' || inv.status === 'CONFIRMED') {
                status = 'paga';
                container = containers.pagas;
            } else if (inv.dueDate < hoje) {
                status = 'vencida';
                container = containers.vencidas;
            } else {
                status = 'apagar';
                container = containers.apagar;
            }
            
            if (container) {
                const card = createInvoiceCard(inv, status);
                container.innerHTML += card;
                document.getElementById(status + 's').style.display = 'block';
            }
        });
    }

    function createInvoiceCard(inv, statusClass) {
        const valor = parseFloat(inv.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const vencimento = new Date(inv.dueDate + 'T12:00:00').toLocaleDateString('pt-BR');

        return `
            <div class="card">
                <p class="card-status status-${statusClass}">${statusClass.toUpperCase()}</p>
                <p class="card-valor">${valor}</p>
                <p>Vencimento: ${vencimento}</p>
                <a href="${inv.invoiceUrl}" target="_blank" class="card-link">Ver Boleto / Pagar</a>
            </div>
        `;
    }
    
    function getFriendlyErrorMessage(code) {
        switch (code) {
            case 'auth/user-not-found':
            case 'auth/invalid-credential': // Novo código de erro para login inválido
                return "E-mail ou senha incorreta. Por favor, tente novamente.";
            case 'auth/wrong-password':
                return "Senha incorreta. Por favor, tente novamente.";
            case 'auth/invalid-email':
                return "O formato do e-mail é inválido.";
            case 'auth/email-already-in-use':
                return "Este e-mail já está cadastrado.";
            case 'auth/weak-password':
                return "A senha é muito fraca. Tente uma mais forte.";
            case 'permission-denied': // Adicionado erro de permissão do Firestore
                return "Erro de permissão no banco de dados. Verifique as regras de segurança.";
            default:
                return "Ocorreu um erro. Por favor, tente mais tarde.";
        }
    }

    function showError(element, message) {
        element.textContent = message;
        element.style.display = 'block';
    }

    function clearError(element) {
        element.textContent = '';
        element.style.display = 'none';
    }

    function toggleLoading(isLoading) {
        document.getElementById('loading-overlay').style.display = isLoading ? 'flex' : 'none';
    }

    function toggleMensalidadesLoading(isLoading) {
        document.getElementById('loading-mensalidades').style.display = isLoading ? 'flex' : 'none';
    }

    // --- REGISTRO DO SERVICE WORKER ---
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./service-worker.js')
                .then(reg => console.log('Service Worker registrado com sucesso.'))
                .catch(err => console.log('Erro no registro do Service Worker:', err));
        });
    }
});

