require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');

const app = express();

// --- CONFIGURAÇÃO DE CORS (Cross-Origin Resource Sharing) ---
// Lista de domínios que têm permissão para acessar este backend.
const allowedOrigins = [
  'http://localhost:3000',
  'https://guriribeach.com.br',
  'https://www.guriribeach.com.br' // Adicionando a versão com 'www' por segurança
];

const corsOptions = {
  origin: (origin, callback) => {
    // Permite requisições da lista de permissões e requisições sem 'origin' (como Postman)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Acesso não permitido pela política de CORS'));
    }
  },
  optionsSuccessStatus: 200 // Para navegadores mais antigos
};

// Habilita o CORS com as opções definidas
app.use(cors(corsOptions));
// Habilita o Express para entender requisições com corpo em JSON
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
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      req.user = decodedToken;
      return next();
    } catch (error) {
      return res.status(401).send('Token de autorização inválido ou expirado.');
    }
  }
  return res.status(401).send('Cabeçalho de autorização ausente.');
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
    if (!cpf) {
        return res.status(400).send("CPF não encontrado para este usuário.");
    }
    const customerResponse = await axios.get(
      `${ASAAS_API_URL}/customers?cpfCnpj=${cpf}`,
      { headers: { "access_token": ASAAS_API_KEY } }
    );
    if (customerResponse.data.totalCount === 0) {
      // Se não encontrar o cliente no ASAAS, retorna um array vazio (não é um erro)
      return res.status(200).json([]);
    }
    const customerId = customerResponse.data.data[0].id;
    const paymentsResponse = await axios.get(
      `${ASAAS_API_URL}/payments?customer=${customerId}&limit=10`,
      { headers: { "access_token": ASAAS_API_KEY } }
    );
    res.status(200).json(paymentsResponse.data.data);
  } catch (error) {
    console.error("Erro ao buscar dados do ASAAS:", error.response ? error.response.data : error.message);
    res.status(500).send("Erro interno ao buscar mensalidades.");
  }
});

// --- INICIAR O SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

