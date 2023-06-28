import { Customer, CustomerReference } from '@commercetools/platform-sdk';
import CustomError from '../errors/custom.error';
import { UpdateAction } from '@commercetools/sdk-client-v2';
import { handleCustomerResponse, handleError } from '../utils/response.utils';
import {
  createCustomer,
  findCustomer,
  createPaymentMethod,
} from '../service/braintree.service';
import { logger } from '../utils/logger.utils';
import { mapCommercetoolsCustomerToBraintreeCustomerCreateRequest } from '../utils/map.utils';
import {
  CustomerCreateRequest,
  Customer as BraintreeCustomer,
  PaymentMethod,
  PaymentMethodCreateRequest,
} from 'braintree';

function parseVaultRequest(
  customer: Customer
): PaymentMethodCreateRequest | CustomerCreateRequest {
  let request: PaymentMethodCreateRequest;
  try {
    request = JSON.parse(
      customer?.custom?.fields?.vaultRequest
    ) as PaymentMethodCreateRequest;
  } catch (e) {
    request = {
      paymentMethodNonce: customer?.custom?.fields?.vaultRequest,
    } as PaymentMethodCreateRequest;
  }
  if (customer?.custom?.fields?.customerId) {
    request.customerId = customer?.custom?.fields?.customerId;
    if (!request.options) {
      request.options = {};
    }
    request.options.failOnDuplicatePaymentMethod = true;
    return request as PaymentMethodCreateRequest;
  } else {
    return mapCommercetoolsCustomerToBraintreeCustomerCreateRequest(
      customer,
      JSON.stringify(request)
    ) as CustomerCreateRequest;
  }
}

/**
 * Handle the update action
 *
 * @param {CustomerReference} resource The resource from the request body
 * @returns {object}
 */
const update = async (resource: CustomerReference) => {
  try {
    let updateActions: Array<UpdateAction> = [];
    if (!resource?.obj) {
      throw new CustomError(400, 'customer obj is missing');
    }
    const customer: Customer = resource.obj;
    if (customer?.custom?.fields?.findRequest) {
      const request = JSON.parse(customer.custom.fields.findRequest);

      try {
        const customerId =
          request?.customerId ??
          customer?.custom.fields?.customerId ??
          customer.id;
        logger.info(`findCustomer request: ${customerId}`);
        const response = await findCustomer(customerId);
        updateActions = updateActions.concat(
          handleCustomerResponse('find', response, customer)
        );
      } catch (e) {
        logger.error('Call to find customer resulted in an error', e);
        updateActions = handleError('find', e);
      }
    }
    if (customer?.custom?.fields?.createRequest) {
      try {
        const request =
          mapCommercetoolsCustomerToBraintreeCustomerCreateRequest(
            customer,
            customer.custom.fields.createRequest
          );
        logger.info(`createCustomer request: ${JSON.stringify(request)}`);
        if (!request.id) {
          throw new CustomError(400, 'field customerId is missing');
        }
        const response = await createCustomer(request);
        updateActions = updateActions.concat(
          handleCustomerResponse('create', response, customer)
        );
      } catch (e) {
        logger.error('Call to create customer resulted in an error', e);
        updateActions = handleError('create', e);
      }
    }
    if (customer?.custom?.fields?.vaultRequest) {
      try {
        const request = parseVaultRequest(customer);
        let response: BraintreeCustomer | PaymentMethod;
        if (!customer?.custom.fields?.customerId) {
          logger.info(`createCustomer request: ${JSON.stringify(request)}`);
          response = await createCustomer(request);
        } else {
          logger.info(
            `createPaymentMethod request: ${JSON.stringify(request)}`
          );
          response = await createPaymentMethod(
            <PaymentMethodCreateRequest>request
          );
        }
        updateActions = updateActions.concat(
          handleCustomerResponse('vault', response, customer)
        );
      } catch (e) {
        logger.error('Call to vault resulted in an error', e);
        updateActions = handleError('vault', e);
      }
    }
    return { statusCode: 200, actions: updateActions };
  } catch (error) {
    // Retry or handle the error
    // Create an error object
    if (error instanceof Error) {
      throw new CustomError(
        400,
        `Internal server error on CustomerController: ${error.stack}`
      );
    }
  }
};

/**
 * Handle the cart controller according to the action
 *
 * @param {string} action The action that comes with the request. Could be `Create` or `Update`
 * @param {Resource} resource The resource from the request body
 * @returns {Promise<object>} The data from the method that handles the action
 */
export const customerController = async (
  action: string,
  resource: CustomerReference
) => {
  switch (action) {
    case 'Create': {
      break;
    }
    case 'Update':
      return await update(resource);
    default:
      throw new CustomError(
        500,
        `Internal Server Error - Resource not recognized. Allowed values are 'Create' or 'Update'.`
      );
  }
};
