import { Router } from 'express';
import { authRouter } from './auth';
import { categoriesRouter } from './categories';
import { productsRouter } from './products';
import { cartRouter } from './cart';
import { ordersRouter } from './orders';
import { reviewsRouter } from './reviews';
import { mediaRouter } from './media';
import { heroRouter, postersRouter } from './banners';
import { settingsRouter } from './settings';
import { aboutRouter } from './about';
import { paymentsRouter } from './payments';
import { adminRouter } from './admin';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/categories', categoriesRouter);
apiRouter.use('/products', productsRouter);
apiRouter.use('/cart', cartRouter);
apiRouter.use('/orders', ordersRouter);
apiRouter.use('/reviews', reviewsRouter);
apiRouter.use('/media', mediaRouter);
apiRouter.use('/hero', heroRouter);
apiRouter.use('/posters', postersRouter);
apiRouter.use('/settings', settingsRouter);
apiRouter.use('/about', aboutRouter);
apiRouter.use('/payment-methods', paymentsRouter);
apiRouter.use('/admin', adminRouter);
