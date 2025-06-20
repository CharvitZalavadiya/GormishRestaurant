import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import OrdersHeader from './orders/OrdersHeader';
import OrderStatusTabs from './orders/OrderStatusTabs';
import OrderCard from './orders/OrderCard';
import CardGrid from './ui/CardGrid';
import LoadingSpinner from './ui/LoadingSpinner';
import ErrorBoundary from './ErrorBoundary';
import { Order, OrderStatus } from '../types/orders';
import { format } from 'date-fns';
import api from '../utils/api';
import OrderDetailsModal from './orders/OrderDetailsModal';

const orderStates: OrderStatus[] = ['pending', 'preparing', 'ready'] as OrderStatus[];

interface OrderCardData {
  id: string;
  customer: string;
  address: string;
  items: { name: string; quantity: number; price: number }[];
  total: number;
  status: OrderStatus;
  timestamp: string;
}

interface OrderWithStringAddress {
  id: string;
  customerName: string;
  customerId: string;
  customer: any;
  address: string;
  items: any[];
  total: number;
  status: OrderStatus;
  date: string;
  time: string;
  paymentType: 'COD' | 'ONLINE';
  paymentStatus?: string;
  customerNotes?: string;
  orderType: 'DELIVERY' | 'TAKEAWAY';
  restaurantId: string;
  deliveryPartnerId?: string;
  distance?: number;
  gst?: number;
  deliveryFee?: number;
  itemsAmount?: number;
  dpAcceptedAt?: string;
  dpDeliveredAt?: string;
  placedAt: string;
  restaurant?: {
    id: string;
    name: string;
  };
  deliveryPartner?: {
    id: string;
    name: string;
  };
}

interface OrdersProps {
  restaurantId: string;
}

const Orders: React.FC<OrdersProps> = ({ restaurantId }) => {
  const [activeTab, setActiveTab] = useState<OrderStatus>('pending');
  const [isOnline, setIsOnline] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [orders, setOrders] = useState<OrderWithStringAddress[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderWithStringAddress | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let cacheTimestamp = 0;
    let cachedOrders: OrderWithStringAddress[] = [];
    const pollingInterval = 5000; // 5 seconds
    const cacheDuration = 5 * 60 * 1000; // 5 minutes

    const fetchOrders = async (forceFetch = false) => {
      if (!isMounted) return;
      const now = Date.now();
      if (!forceFetch && cachedOrders.length > 0 && (now - cacheTimestamp) < cacheDuration) {
        // Use cached orders
        setOrders(cachedOrders);
        return;
      }
      // Show loader only on initial fetch, not on polling
      if (!forceFetch) {
        setIsLoading(true);
      }
      try {
        const response = await api.get(`/orders/restaurant/${restaurantId}`);
        const apiOrders = response.data.data;
        const mappedOrders = apiOrders.map((order: any) => {
          let addressString = 'Address not available';
          if (order.address) {
            if (typeof order.address === 'string') {
              addressString = order.address;
            } else if (typeof order.address === 'object') {
              const addr = order.address as { typedAddress?: string; mappedAddress?: string };
              addressString = addr.typedAddress || addr.mappedAddress || JSON.stringify(order.address);
            }
          } else if (order.customer?.address) {
            if (typeof order.customer.address === 'string') {
              addressString = order.customer.address;
            } else if (typeof order.customer.address === 'object') {
              const addr = order.customer.address as { typedAddress?: string; mappedAddress?: string };
              addressString = addr.typedAddress || addr.mappedAddress || JSON.stringify(order.customer.address);
            }
          }
          return {
            id: order.id,
            customerName: order.customer?.name || 'Unknown Customer',
            address: addressString,
            items: order.items || [],
            total: parseFloat(order.totalAmount) || order.total || order.items?.reduce((sum: number, item: any) => sum + (item.totalPrice || 0), 0) || 0,
            status: order.status || 'pending',
            date: format(new Date(order.placedAt), 'MMM dd, yyyy'),
            time: format(new Date(order.placedAt), 'hh:mm a'),
            customerNotes: order.customerNotes,
            paymentType: order.paymentType,
            paymentStatus: order.paymentStatus,
            orderType: order.orderType,
            restaurantId: order.restaurantId,
            deliveryPartnerId: order.deliveryPartnerId,
            distance: order.distance,
            gst: order.gst,
            deliveryFee: order.deliveryFee,
            itemsAmount: order.itemsAmount,
            dpAcceptedAt: order.dpAcceptedAt,
            dpDeliveredAt: order.dpDeliveredAt,
            customerId: order.customerId,
            placedAt: order.placedAt,
            restaurant: order.restaurant,
            customer: order.customer,
            deliveryPartner: order.deliveryPartner,
          };
        });

        // Merge new orders into cachedOrders, keep user-updated statuses
        const mergedOrdersMap = new Map<string, OrderWithStringAddress>();
        // Add cached orders first
        cachedOrders.forEach(order => {
          mergedOrdersMap.set(order.id, order);
        });
        // Add/overwrite with fetched orders, but keep status from cached if user updated
        mappedOrders.forEach((fetchedOrder: OrderWithStringAddress) => {
          const cachedOrder = mergedOrdersMap.get(fetchedOrder.id);
          if (cachedOrder) {
            // If status changed by user, keep cached status
            if (cachedOrder.status !== fetchedOrder.status && cachedOrder.status !== 'pending') {
              fetchedOrder.status = cachedOrder.status;
            }
          }
          mergedOrdersMap.set(fetchedOrder.id, fetchedOrder);
        });

        const mergedOrders = Array.from(mergedOrdersMap.values());

        // Compare with cached orders to update only if status changed
        let hasStatusChanged = false;
        if (cachedOrders.length === 0) {
          hasStatusChanged = true;
        } else {
          for (const newOrder of mergedOrders) {
            const cachedOrder = cachedOrders.find(o => o.id === newOrder.id);
            if (!cachedOrder || cachedOrder.status !== newOrder.status) {
              hasStatusChanged = true;
              break;
            }
          }
        }
        if (hasStatusChanged) {
          cachedOrders = mergedOrders;
          cacheTimestamp = now;
          setOrders(mergedOrders);
        }
      } catch (error) {
        toast.error('Failed to fetch orders');
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrders();

    const intervalId = setInterval(() => {
      if (activeTab === 'pending') {
        fetchOrders(true);
      }
    }, pollingInterval);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [restaurantId, activeTab]);

  const filteredOrders = orders.filter(order => {
    if (activeTab === 'pending') {
      return order.status === 'pending' &&
        (searchQuery === '' ||
         order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
         order.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
         order.items.some((item: any) => item.menuItem?.name.toLowerCase().includes(searchQuery.toLowerCase())));
    }
    return order.status === activeTab &&
      (searchQuery === '' ||
       order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
       order.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
       order.items.some((item: any) => item.menuItem?.name.toLowerCase().includes(searchQuery.toLowerCase())));
  });

  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    try {
      await api.patch(`/orders/${orderId}/status`, { status: newStatus });
      if (newStatus === 'dispatch') {
        setOrders(prevOrders => prevOrders.filter(order => order.id !== orderId));
        toast.success('Order dispatched and moved to history');
      } else {
        setOrders(prevOrders =>
          prevOrders.map(order =>
            order.id === orderId ? { ...order, status: newStatus } : order
          )
        );
        toast.success(`Order updated to ${newStatus}`);
      }
    } catch (error) {
      toast.error('Failed to update order status');
    }
  };

  const handleApproveOrder = async (orderId: string) => {
    try {
      await api.patch(`/orders/${orderId}/status`, { status: 'preparing' });
      setOrders(prevOrders =>
        prevOrders.map(order =>
          order.id === orderId ? { ...order, status: 'preparing' } : order
        )
      );
      toast.success('Order approved and moved to preparing');
    } catch (error) {
      toast.error('Failed to approve order');
    }
  };

  const handleRejectOrder = async (orderId: string) => {
    try {
      await api.patch(`/orders/${orderId}/status`, { status: 'rejected' });
      setOrders(prevOrders => prevOrders.filter(order => order.id !== orderId));
      toast.error('Order rejected');
    } catch (error) {
      toast.error('Failed to reject order');
    }
  };

const orderToCardData = (order: OrderWithStringAddress): OrderCardData => {
  const items = order.items.map((item: any) => ({
    name: item.menuItem?.name || 'Unknown',
    quantity: item.quantity || 0,
    price: Number(item.basePrice) || 0,
    addons: item.addons?.map((addon: any) => ({
      name: addon.name,
      price: Number(addon.extraPrice) || 0,
    })) || [],
  }));

  // Calculate total including add-ons, delivery fee, and gst
  const itemsTotal = items.reduce((sum, item) => {
    const addonsTotal = item.addons.reduce((addonSum: number, addon: { price: number }) => addonSum + addon.price, 0);
    return sum + item.price * item.quantity + addonsTotal * item.quantity;
  }, 0);

  const deliveryFee = Number(order.deliveryFee) || 0;
  const gst = Number(order.gst) || 0;

  const total = itemsTotal + deliveryFee + gst;

  return {
    id: order.id,
    customer: order.customerName || 'Unknown Customer',
    address: order.address || order.customer?.address || 'Address not available',
    items,
    total,
    status: order.status,
    timestamp: order.date && order.time ? `${order.date} ${order.time}` : 'Date not available',
  };
};

  const openOrderDetails = (order: OrderWithStringAddress) => {
    setSelectedOrder(order);
    setIsModalOpen(true);
  };

  const closeOrderDetails = () => {
    setSelectedOrder(null);
    setIsModalOpen(false);
  };

  // Transform selectedOrder to match OrderDetailsModalProps type
const getModalOrder = () => {
    if (!selectedOrder) return null;
    // Map items and addons properly for modal
    const items = selectedOrder.items.map((item: any) => ({
      name: item.menuItem?.name || 'Unknown',
      quantity: item.quantity || 0,
      basePrice: Number(item.price ?? item.totalPrice ?? 0),
      addons: item.addons?.map((addon: any) => ({
        name: addon.name,
        price: addon.price !== undefined ? Number(addon.price) : (addon.extraPrice !== undefined ? Number(addon.extraPrice) : 0),
      })) || [],
    }));

    // Calculate total including add-ons, delivery fee, and gst
    const itemsTotal = items.reduce((sum, item) => {
      const addonsTotal = item.addons.reduce((addonSum: number, addon: { price: number }) => addonSum + addon.price, 0);
      return sum + item.basePrice * item.quantity + addonsTotal * item.quantity;
    }, 0);

    const deliveryFee = Number(selectedOrder.deliveryFee) || 0;
    const gst = Number(selectedOrder.gst) || 0;

    const total = itemsTotal + deliveryFee + gst;

    // Convert address object to string if needed
    let addressString = 'Address not available';
    if (selectedOrder.address) {
      if (typeof selectedOrder.address === 'string') {
        addressString = selectedOrder.address;
      } else if (typeof selectedOrder.address === 'object') {
        const addr = selectedOrder.address as { typedAddress?: string; mappedAddress?: string };
        addressString = addr.typedAddress || addr.mappedAddress || JSON.stringify(selectedOrder.address);
      }
    } else if (selectedOrder.customer?.address) {
      if (typeof selectedOrder.customer.address === 'string') {
        addressString = selectedOrder.customer.address;
      } else if (typeof selectedOrder.customer.address === 'object') {
        const addr = selectedOrder.customer.address as { typedAddress?: string; mappedAddress?: string };
        addressString = addr.typedAddress || addr.mappedAddress || JSON.stringify(selectedOrder.customer.address);
      }
    }
    return {
      id: selectedOrder.id,
      customer: selectedOrder.customer.name,
      address: addressString,
      items,
      total,
      timestamp: selectedOrder.date && selectedOrder.time ? `${selectedOrder.date} ${selectedOrder.time}` : 'Date not available',
    };
  };

  return (
    <ErrorBoundary>
      <div className="responsive-container px-4">
        <OrdersHeader
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          restaurantId={restaurantId}
        />
        <div className="pt-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 sm:mt-14"
          >
            <OrderStatusTabs
              orderStates={orderStates}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />
          </motion.div>
          {isLoading ? (
            <LoadingSpinner />
          ) : (
            <CardGrid columns={{ sm: 1, lg: 2, xl: 3 }}>
              {filteredOrders.map((order) => (
                <div key={order.id} onClick={() => openOrderDetails(order)} className="cursor-pointer">
                  <OrderCard
                    order={orderToCardData(order)}
                    activeTab={activeTab}
                    onApprove={() => handleApproveOrder(order.id)}
                    onReject={() => handleRejectOrder(order.id)}
                    onStatusChange={(newStatus) => handleStatusChange(order.id, newStatus)}
                  />
                </div>
              ))}
            </CardGrid>
          )}
        </div>
        <OrderDetailsModal
          isOpen={isModalOpen}
          onClose={closeOrderDetails}
          order={getModalOrder()}
        />
      </div>
    </ErrorBoundary>
  );
};

export default Orders;
