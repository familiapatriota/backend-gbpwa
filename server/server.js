// Importa as bibliotecas
require('dotenv').config(); // Carrega as variáveis de ambiente do arquivo .env
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');

// --- CONFIGURAÇÃO INICIAL ---
const app = express();
app.use(cors()); // Habilita o CORS para todas as requisições
app.use(express.json());

// --- CONEXÃO COM FIREBASE ---
// Carrega as credenciais do Firebase Admin SDK
try {
  const serviceAccount = require('./firebase-service-account.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} catch (error) {
  console.error("ERRO: O arquivo 'firebase-service-account.json' não foi encontrado ou está inválido.");
  console.error("Por favor, baixe o arquivo do seu console do Firebase e coloque-o na pasta 'server'.");
  process.exit(1); // Encerra a aplicação se o arquivo de credenciais não for encontrado
}
const db = admin.firestore();

// --- MIDDLEWARE DE AUTENTICAÇÃO ---
// Esta função irá verificar se o usuário está logado em todas as rotas protegidas
const checkAuth = async (req, res, next) => {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    const idToken = req.headers.authorization.split('Bearer ')[1];
    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      req.user = decodedToken; // Adiciona os dados do usuário à requisição
      return next();
    } catch (error) {
      console.error('Erro de verificação de token:', error);
      return res.status(401).send('Acesso não autorizado: Token inválido.');
    }
  }
  return res.status(401).send('Acesso não autorizado: Token não fornecido.');
};


// --- ROTA PRINCIPAL DA API ---
app.get('/api/mensalidades', checkAuth, async (req, res) => {
  const uid = req.user.uid;
  const ASAAS_API_KEY = process.env.ASAAS_API_KEY;
  const ASAAS_API_URL = "https://www.asaas.com/api/v3";

  if (!ASAAS_API_KEY) {
    console.error("ERRO: A variável de ambiente ASAAS_API_KEY não foi definida no arquivo .env");
    return res.status(500).send("Erro de configuração no servidor.");
  }

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
    console.error("Erro ao buscar dados do ASAAS:", error.response ? error.response.data : error.message);
    res.status(500).send("Erro interno ao buscar mensalidades.");
  }
});

// --- ROTA PARA SERVIR OS ARQUIVOS DO FRONTEND ---
// O servidor também servirá os arquivos estáticos da pasta 'client'
app.use(express.static('../client'));

// --- INICIAR O SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

