// --- BIBLIOTECAS E CONFIGURAÇÃO INICIAL ---
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');

const app = express();

// --- CONFIGURAÇÃO DE CORS (Cross-Origin Resource Sharing) ---
// Define explicitamente que seu servidor só pode receber chamadas do seu site.
const corsOptions = {
  origin: 'https://guriribeach.com.br',
  optionsSuccessStatus: 200 // Para navegadores mais antigos
};
app.use(cors(corsOptions));
// Habilita o servidor a responder a requisições de verificação 'OPTIONS'
app.options('*', cors(corsOptions));
app.use(express.json());


// --- CONEXÃO COM FIREBASE ---
try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} catch (error) {
  console.error("ERRO: As credenciais do Firebase não puderam ser carregadas a partir da variável de ambiente FIREBASE_CREDENTIALS.");
  console.error("Por favor, verifique se a variável de ambiente foi configurada corretamente no painel do Render.");
  process.exit(1);
}
const db = admin.firestore();

// --- VARIÁVEIS DE AMBIENTE DO ASAAS ---
const ASAAS_API_KEY = process.env.ASAAS_API_KEY;
const ASAAS_API_URL = "https://www.asaas.com/api/v3";

// --- MIDDLEWARE DE AUTENTICAÇÃO ---
// Verifica se o usuário está logado em todas as rotas protegidas
const checkAuth = async (req, res, next) => {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    const idToken = req.headers.authorization.split('Bearer ')[1];
    try {
      req.user = await admin.auth().verifyIdToken(idToken);
      return next();
    } catch (error) {
      return res.status(401).send('Acesso não autorizado: Token inválido.');
    }
  }
  return res.status(401).send('Acesso não autorizado: Token não fornecido.');
};

// --- NOVAS ROTAS DA API ---

// ROTA DE REGISTRO: Vincula o usuário do Firebase ao cliente do Asaas
app.post('/api/register', checkAuth, async (req, res) => {
  const { uid, email } = req.user;
  const { name, cpf } = req.body;

  if (!name || !cpf) {
    return res.status(400).send("Nome e CPF são obrigatórios.");
  }

  try {
    const customerResponse = await axios.get(
      `${ASAAS_API_URL}/customers?cpfCnpj=${cpf}`,
      { headers: { "access_token": ASAAS_API_KEY } }
    );

    if (customerResponse.data.totalCount === 0) {
      return res.status(404).send("Nenhum cliente encontrado no Asaas com este CPF.");
    }
    const asaasCustomerId = customerResponse.data.data[0].id;

    await db.collection("users").doc(uid).set({
      name,
      cpf,
      email,
      asaasCustomerId,
    });

    res.status(201).send({ message: "Usuário registrado e vinculado com sucesso." });
  } catch (error) {
    console.error("Erro no registro do usuário:", error.response ? error.response.data : error.message);
    res.status(500).send("Erro interno ao registrar usuário.");
  }
});


// ROTA DE MENSALIDADES (OTIMIZADA): Busca usando o ID do cliente salvo
app.get('/api/mensalidades', checkAuth, async (req, res) => {
  const { uid } = req.user;
  try {
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).send("Dados do usuário não encontrados.");
    }

    const { asaasCustomerId } = userDoc.data();
    if (!asaasCustomerId) {
      return res.status(404).send("ID de cliente Asaas não encontrado para este usuário.");
    }

    const paymentsResponse = await axios.get(
      `${ASAAS_API_URL}/payments?customer=${asaasCustomerId}&limit=10`,
      { headers: { "access_token": ASAAS_API_KEY } }
    );
    
    res.status(200).json(paymentsResponse.data.data);
  } catch (error) {
    console.error("Erro ao buscar mensalidades:", error.response ? error.response.data : error.message);
    res.status(500).send("Erro interno ao buscar mensalidades.");
  }
});

// --- INICIAR O SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

