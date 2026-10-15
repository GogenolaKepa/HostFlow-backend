const router = require('express').Router();
const controller = require('../controllers/ConfiguracionController');
router.get('/empresa',controller.empresa);
router.put('/empresa',controller.guardarEmpresa);
router.get('/operativas',controller.operativas);
router.put('/operativas',controller.guardarOperativas);
router.get('/predeterminados-reserva',controller.predeterminados);
module.exports = router;
