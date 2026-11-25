const User = require('../models/User');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Order = require('../models/Order');

/** Real aggregates from the database; revenue counts every order except CANCELLED. */
async function stats() {
  const [
    totalCustomers,
    activeCustomers,
    totalProducts,
    activeProducts,
    totalCategories,
    totalOrders,
    pendingOrders,
    revenueAgg,
    byStatus,
  ] = await Promise.all([
    User.countDocuments({ role: 'CUSTOMER' }),
    User.countDocuments({ role: 'CUSTOMER', isActive: true }),
    Product.countDocuments(),
    Product.countDocuments({ status: 'ACTIVE' }),
    Category.countDocuments(),
    Order.countDocuments(),
    Order.countDocuments({ status: 'PENDING' }),
    Order.aggregate([{ $match: { status: { $ne: 'CANCELLED' } } }, { $group: { _id: null, revenue: { $sum: '$total' } } }]),
    Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);

  return {
    totalCustomers,
    activeCustomers,
    totalProducts,
    activeProducts,
    totalCategories,
    totalOrders,
    pendingOrders,
    revenue: revenueAgg[0] ? Math.round(revenueAgg[0].revenue * 100) / 100 : 0,
    ordersByStatus: Object.fromEntries(byStatus.map((r) => [r._id, r.count])),
  };
}

module.exports = { stats };
