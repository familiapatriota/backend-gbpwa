// --- IMPORTAÇÕES E CONFIGURAÇÃO INICIAL ---
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');

const app = express();

// --- CONFIGURAÇÃO DE CORS (MUITO IMPORTANTE) ---
// Define quais domínios podem acessar este backend
const whitelist = ['https://guriribeach.com.br', 'http://localhost:3000'];
const corsOptions = {
  origin: function (origin, callback) {
    if (whitelist.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
};
app.use(cors(corsOptions)); // Usa a configuração de CORS
app.use(express.json());

// --- CONEXÃO COM FIREBASE ---
try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} catch (error) {
  console.error("ERRO: As credenciais do Firebase não puderam ser carregadas.");
  process.exit(1);
}

const db = admin.firestore();
const ASAAS_API_KEY = process.env.ASAAS_API_KEY;
const ASAAS_API_URL = "https://www.asaas.com/api/v3";

// --- MIDDLEWARE DE AUTENTICAÇÃO ---
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
  return res.status(401).send('Acesso não autorizado: Token ausente.');
};

// --- ROTA PRINCIPAL DA API ---
app.get('/api/mensalidades', checkAuth, async (req, res) => {
  const uid = req.user.uid;
  try {
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).send("Usuário não encontrado.");
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
    console.error("Erro na API:", error.message);
    res.status(500).send("Erro interno ao buscar mensalidades.");
  }
});

// --- ROTA DE STATUS (PARA TESTE) ---
app.get('/status', (req, res) => {
  res.status(200).send('Servidor online.');
});


// --- INICIAR O SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

