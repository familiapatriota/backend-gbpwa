// --- IMPORTAÇÕES E CONFIGURAÇÃO INICIAL ---
require('dotenv').config(); // Carrega as variáveis de ambiente do arquivo .env
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json());

// --- CONEXÃO COM FIREBASE ---
try {
  // Carrega as credenciais do Firebase a partir das variáveis de ambiente do Render
  const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} catch (error) {
  console.error("ERRO: As credenciais do Firebase não puderam ser carregadas a partir da variável de ambiente FIREBASE_CREDENTIALS.");
  console.error("Por favor, verifique se a variável de ambiente foi configurada corretamente no painel do Render.");
  process.exit(1); // Encerra a aplicação se as credenciais não forem encontradas
}

const db = admin.firestore();
const ASAAS_API_KEY = process.env.ASAAS_API_KEY;
const ASAAS_API_URL = "https://www.asaas.com/api/v3";

// --- MIDDLEWARE DE AUTENTICAÇÃO ---
const checkAuth = async (req, res, next) => {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    const idToken = req.headers.authorization.split('Bearer ')[1];
    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      req.user = decodedToken;
      return next();
    } catch (error) {
      return res.status(401).send('Acesso não autorizado');
    }
  }
  return res.status(401).send('Acesso não autorizado');
};

// --- ROTA PRINCIPAL DA API ---
app.get('/api/mensalidades', checkAuth, async (req, res) => {
  const uid = req.user.uid;

  try {
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).send("Usuário não encontrado no banco de dados.");
    }
    const cpf = userDoc.data().cpf;

    const customerResponse = await axios.get(
      `${ASAAS_API_URL}/customers?cpfCnpj=${cpf}`,
      { headers: { "access_token": ASAAS_API_KEY } }
    );
    if (customerResponse.data.totalCount === 0) {
      return res.status(404).send("Cliente não encontrado no ASAAS.");
    }
    const customerId = customerResponse.data.data[0].id;
    
    const paymentsResponse = await axios.get(
      `${ASAAS_API_URL}/payments?customer=${customerId}&limit=10`,
      { headers: { "access_token": ASAAS_API_KEY } }
    );
    
    res.status(200).json(paymentsResponse.data.data);

  } catch (error) {
    console.error("Erro ao buscar dados do ASAAS:", error);
    res.status(500).send("Erro interno ao buscar mensalidades.");
  }
});

// --- ROTA PARA SERVIR OS ARQUIVOS DO FRONTEND ---
app.use(express.static('../client'));

// --- INICIAR O SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

