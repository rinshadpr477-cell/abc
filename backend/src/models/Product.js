const mongoose = require('mongoose');

const PRODUCT_STATUS = Object.freeze({ ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE' });

const { isHttpUrl } = require('../utils/helpers');

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 200 },
    sku: { type: String, required: true, trim: true, uppercase: true, unique: true, maxlength: 64 },
    description: { type: String, trim: true, maxlength: 5000, default: '' },
    price: { type: Number, required: true, min: 0 },
    salePrice: { type: Number, min: 0, default: null },
    // Price actually charged: salePrice when it is valid (< price), otherwise price.
    // Maintained on save so filtering/sorting by price is a plain indexed field.
    effectivePrice: { type: Number, min: 0 },
    stock: { type: Number, required: true, min: 0, default: 0, validate: Number.isInteger },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    // Optional external image link (http/https only). No upload service: the URL is stored as given.
    imageUrl: {
      type: String,
      trim: true,
      maxlength: 2048,
      default: null,
      validate: {
        validator: (v) => v == null || isHttpUrl(v),
        message: 'imageUrl must be a valid http(s) URL',
      },
    },
    status: { type: String, enum: Object.values(PRODUCT_STATUS), default: PRODUCT_STATUS.ACTIVE },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: false,
      transform(_doc, ret) {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        ret.imageUrl = ret.imageUrl || null; // legacy products created before the field existed
        ret.onSale = ret.salePrice != null && ret.salePrice < ret.price;
        ret.inStock = ret.stock > 0;
        return ret;
      },
    },
  }
);

const isValidSale = (price, salePrice) => salePrice != null && salePrice >= 0 && salePrice < price;

productSchema.pre('validate', async function () {
  if (this.salePrice != null && this.salePrice >= this.price) {
    this.invalidate('salePrice', 'salePrice must be lower than price');
  }
  this.effectivePrice = isValidSale(this.price, this.salePrice) ? this.salePrice : this.price;
});

productSchema.index({ category: 1, status: 1 });
productSchema.index({ status: 1, effectivePrice: 1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ name: 1 });

module.exports = mongoose.model('Product', productSchema);
module.exports.PRODUCT_STATUS = PRODUCT_STATUS;
