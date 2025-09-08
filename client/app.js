// =================================================================
// INSIRA A URL DO SEU BACKEND AQUI
// Copie a URL do seu serviço no Render (ex: https://guriri-beach-api.onrender.com)
// e cole dentro das aspas abaixo.
// =================================================================
const backendUrl = 'https://guriri-beach-api.onrender.com';
// =================================================================


// --- INICIALIZAÇÃO DO FIREBASE E LÓGICA PRINCIPAL ---
document.addEventListener('DOMContentLoaded', () => {
  // Verifique se a configuração do Firebase está disponível
  if (typeof firebase === 'undefined' || !firebase.apps.length) {
    console.error('Firebase não está carregado. Verifique o script de configuração no HTML.');
    return;
  }

  const auth = firebase.auth();
  const db = firebase.firestore();

  // Verifica em qual página o script está rodando pela existência de um elemento chave
  const isLoginPage = document.getElementById('login-form');
  const isMainPage = document.getElementById('invoices-section');

  if (isLoginPage) {
    setupLoginPage();
  } else if (isMainPage) {
    // Na página principal, primeiro verificamos o estado de autenticação
    auth.onAuthStateChanged(user => {
      if (user) {
        // Se o usuário está logado, configuramos a página principal
        setupMainPage(user);
      } else {
        // Se não está logado, redireciona para o login
        window.location.href = 'login.html';
      }
    });
  }

  // --- FUNÇÕES DE SETUP DAS PÁGINAS ---

  function setupLoginPage() {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const showSignupLink = document.getElementById('show-signup');
    const showLoginLink = document.getElementById('show-login');

    if (showSignupLink) {
        showSignupLink.addEventListener('click', (e) => {
            e.preventDefault();
            loginForm.style.display = 'none';
            signupForm.style.display = 'block';
        });
    }
    
    if (showLoginLink) {
        showLoginLink.addEventListener('click', (e) => {
            e.preventDefault();
            signupForm.style.display = 'none';
            loginForm.style.display = 'block';
        });
    }

    // Event listeners para os botões
    document.getElementById('btn-login').addEventListener('click', handleLogin);
    document.getElementById('btn-signup').addEventListener('click', handleSignup);
  }

  function setupMainPage(user) {
    document.getElementById('user-info').textContent = `Olá, ${user.email}`;
    document.getElementById('btn-logout').addEventListener('click', () => {
      auth.signOut();
    });
    fetchAndDisplayInvoices(user);
  }

  // --- FUNÇÕES DE AUTENTICAÇÃO E MANIPULAÇÃO DE DADOS ---

  async function handleSignup(e) {
    e.preventDefault();
    const name = document.getElementById('signup-name').value;
    const cpf = document.getElementById('signup-cpf').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;

    if (!name || !cpf || !email || !password) {
      showError('Por favor, preencha todos os campos.', 'signup-error');
      return;
    }

    try {
      const userCredential = await auth.createUserWithEmailAndPassword(email, password);
      const user = userCredential.user;
      await db.collection('users').doc(user.uid).set({ name, cpf, email });
      window.location.href = 'index.html';
    } catch (error) {
      console.error("Erro detalhado no cadastro:", error);
      let message = 'Ocorreu um erro. Por favor, tente mais tarde.';
      if (error.code === 'auth/email-already-in-use') message = 'Este e-mail já está em uso.';
      if (error.code === 'auth/weak-password') message = 'A senha deve ter no mínimo 6 caracteres.';
      if (error.code === 'permission-denied') message = 'Erro de permissão ao salvar dados.';
      showError(message, 'signup-error');
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
      showError('Por favor, preencha todos os campos.', 'login-error');
      return;
    }

    try {
      await auth.signInWithEmailAndPassword(email, password);
      window.location.href = 'index.html';
    } catch (error) {
      console.error("Erro detalhado no login:", error);
      let message = 'Ocorreu um erro. Por favor, tente mais tarde.';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        message = 'E-mail ou senha incorretos.';
      }
      showError(message, 'login-error');
    }
  }

  async function fetchAndDisplayInvoices(user) {
    const loadingContainer = document.getElementById('loading-container');
    const invoicesSection = document.getElementById('invoices-section');
    
    loadingContainer.style.display = 'block';
    invoicesSection.style.display = 'none';

    try {
      const idToken = await user.getIdToken(true); // Força a atualização do token
      const response = await fetch(`${backendUrl}/api/mensalidades`, {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Erro do servidor (${response.status}): ${errorData}`);
      }

      const invoices = await response.json();
      renderInvoices(invoices);

    } catch (error) {
      console.error("Erro ao buscar mensalidades:", error);
      const vencidasContainer = document.getElementById('vencidas-container');
      vencidasContainer.innerHTML = `<p class="error-message">Não foi possível buscar as mensalidades. Verifique sua conexão e tente novamente.</p>`;
    } finally {
      loadingContainer.style.display = 'none';
      invoicesSection.style.display = 'block';
    }
  }

  function renderInvoices(invoices) {
    const vencidasContainer = document.getElementById('vencidas-container');
    const apagarContainer = document.getElementById('apagar-container');
    const pagasContainer = document.getElementById('pagas-container');

    vencidasContainer.innerHTML = '';
    apagarContainer.innerHTML = '';
    pagasContainer.innerHTML = '';

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    if (invoices.length === 0) {
        apagarContainer.innerHTML = "<p>Nenhuma mensalidade encontrada.</p>";
        return;
    }

    invoices.forEach(inv => {
      const dueDate = new Date(inv.dueDate);
      const invoiceElement = document.createElement('div');
      invoiceElement.className = 'invoice-card';

      let statusTag = '';
      if (inv.status === 'PAID' || inv.status === 'CONFIRMED') {
        statusTag = '<span class="tag tag-pago">PAGO</span>';
      } else if (dueDate < hoje) {
        statusTag = '<span class="tag tag-vencido">VENCIDA</span>';
      }

      invoiceElement.innerHTML = `
        <div class="invoice-details">
            <p class="invoice-value">R$ ${Number(inv.value).toFixed(2).replace('.', ',')}</p>
            <p class="invoice-due-date">Vencimento: ${new Date(inv.dueDate).toLocaleDateString('pt-BR', {timeZone: 'UTC'})}</p>
        </div>
        <div class="invoice-actions">
            ${statusTag}
            <a href="${inv.invoiceUrl || inv.bankSlipUrl}" target="_blank" class="btn-primary">Ver Boleto / Pagar</a>
        </div>
      `;

      if (inv.status === 'PAID' || inv.status === 'CONFIRMED') {
        pagasContainer.appendChild(invoiceElement);
      } else if (dueDate < hoje) {
        vencidasContainer.appendChild(invoiceElement);
      } else {
        apagarContainer.appendChild(invoiceElement);
      }
    });

    if(vencidasContainer.childElementCount === 0) vencidasContainer.innerHTML = "<p>Nenhuma mensalidade vencida.</p>";
    if(apagarContainer.childElementCount === 0) apagarContainer.innerHTML = "<p>Nenhuma mensalidade a pagar.</p>";
    if(pagasContainer.childElementCount === 0) pagasContainer.innerHTML = "<p>Nenhuma mensalidade paga.</p>";
  }

  function showError(message, elementId) {
    const errorElement = document.getElementById(elementId);
    if(errorElement){
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
  }
});

// --- REGISTRO DO SERVICE WORKER ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/gbpwa/service-worker.js').then(registration => {
      console.log('ServiceWorker registrado com sucesso: ', registration.scope);
    }, err => {
      console.log('Falha no registro do ServiceWorker: ', err);
    });
  });
}

