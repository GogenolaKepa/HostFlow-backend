const router=require('express').Router(),controller=require('../controllers/NotificacionController');
router.get('/avisos',controller.avisos);
router.get('/preferencias',controller.preferencias);
router.put('/preferencias',controller.guardar);
router.get('/personales',controller.personales);
router.get('/personales/contador',controller.contador);
router.put('/personales/:id/lectura',controller.lectura);
module.exports=router;
